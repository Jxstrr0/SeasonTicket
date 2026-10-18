/**
 * The player market: asking prices, wage demands, bids both ways, loans in,
 * free agents, releases, renewals, AI-to-AI deals, forced sales and the
 * emergency squad top-up. Fees are paid in full on signing (a documented
 * simplification: no instalments or sell-on clauses).
 */
import { PLAYERS_TUNING, isDomestic } from '../data';
import { teamById } from '../league';
import { defaultNames, homeNationId, makeIdFactory } from '../names';
import { curveAt, generatePlayer, wageFor } from '../players';
import type { Rng } from '../rng';
import type { Player, Position, Team } from '../types';
import { spendingLimits } from './books';
import { reportTransfer } from './news';
import type { Career } from './types';
import { OWNER_MEMORY, bidFactor, ownerMemory, sellFactor } from './rivalry';
import {
  C,
  addInbox,
  careerRng,
  clamp,
  earn,
  freeAgentsOpen,
  money,
  nextId,
  playerName,
  roundMoney,
  spend,
  squadOf,
  transferWindowOpen,
  userBooks,
} from './util';

const T = C.transfers;
const JERSEY = PLAYERS_TUNING.squad.jersey;

export interface DealResult {
  ok: boolean;
  message: string;
  /** Present when the selling club came back with a higher price. */
  counter?: number;
}

const fail = (message: string): DealResult => ({ ok: false, message });

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

export type SquadRole = 'starter' | 'rotation' | 'fringe';

/** Where a player ranks in his club by overall: the top eleven start, the next seven rotate. */
export function squadRole(career: Career, player: Player): SquadRole {
  if (!player.teamId) return 'fringe';
  const ranked = squadOf(career, player.teamId).sort((a, b) => b.overall - a.overall);
  const rank = ranked.findIndex((p) => p.id === player.id);
  if (rank < 11) return 'starter';
  if (rank < 18) return 'rotation';
  return 'fringe';
}

/** What the owning club wants: value x how much they rely on him x how long he is tied down. */
export function askingPrice(career: Career, player: Player): number {
  const contract = curveAt(T.contractFactor as [number, number][], player.contract.years);
  return roundMoney(player.value * T.roleFactor[squadRole(career, player)] * contract, 5000);
}

/** What the selling club's owner asks of you: the asking price, moved by their temperament, their memory of you and your rivalry. */
export function userAskingPrice(career: Career, player: Player): number {
  const base = askingPrice(career, player);
  return player.teamId ? roundMoney(base * sellFactor(career, player.teamId), 5000) : base;
}

/** League position of a club right now (1-based), or the middle of the table before a ball is kicked. */
function tablePosition(career: Career, teamId: string): number {
  const i = career.season.standings.findIndex((r) => r.teamId === teamId);
  return i >= 0 ? i + 1 : Math.ceil(career.season.league.teams.length / 2);
}

/**
 * Yearly wage a player asks of a club: his market wage, a bump for moving,
 * more for stars, more again to join a club lower in the table.
 */
export function wageDemand(career: Career, player: Player, teamId: string): number {
  const d = T.wageDemand;
  const moving = player.teamId !== teamId;
  const star = Math.max(0, player.overall - 60) * d.perStarRating;
  const ambition = (tablePosition(career, teamId) - 1) * d.ambitionPerTablePlace;
  const factor = d.base + (moving ? d.moveBonus : 0) + star + ambition;
  return Math.max(T.minWage, roundMoney(wageFor(player) * factor));
}

/** Rating error for players outside your club, from the head scout. */
export function scoutError(career: Career): number {
  const league = career.season.league;
  const scout = teamById(league, career.userTeamId)
    .staffIds.map((id) => league.staff[id])
    .find((s) => s?.role === 'headScout');
  return Math.max(0, Math.round((100 - (scout?.rating ?? 30)) / C.scouting.divisor));
}

/** The overall and potential the user sees: exact for their own squad, a band for everyone else. */
export function scoutedRange(career: Career, player: Player): { overall: [number, number]; potential: [number, number] } {
  if (player.teamId === career.userTeamId) return { overall: [player.overall, player.overall], potential: [player.potential, player.potential] };
  const e = scoutError(career);
  // A stable offset per player so the band does not jump around between screens.
  const shift = e === 0 ? 0 : (hashInt(player.id) % (e + 1)) - Math.floor(e / 2);
  const band = (v: number): [number, number] => [clamp(v + shift - e, 1, 99), clamp(v + shift + e, 1, 99)];
  return { overall: band(player.overall), potential: band(player.potential) };
}

function hashInt(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

// ---------------------------------------------------------------------------
// Moving players
// ---------------------------------------------------------------------------

function lowestFreeJersey(career: Career, teamId: string): number {
  const used = new Set(squadOf(career, teamId).map((p) => p.jersey));
  for (let n = JERSEY.min; n <= JERSEY.max; n++) if (!used.has(n)) return n;
  return JERSEY.max;
}

/** Moves a player between clubs or to and from the free-agent list, keeping every list consistent. */
export function movePlayer(career: Career, player: Player, toTeamId: string | null): void {
  const league = career.season.league;
  if (player.teamId) {
    const from = teamById(league, player.teamId);
    from.playerIds = from.playerIds.filter((id) => id !== player.id);
    scrubSelection(from, player.id);
  } else {
    league.freeAgentIds = league.freeAgentIds.filter((id) => id !== player.id);
  }
  if (career.userSelection && player.teamId === career.userTeamId) scrubUserSelection(career, player.id);
  player.teamId = toTeamId;
  if (toTeamId) {
    const to = teamById(league, toTeamId);
    player.jersey = lowestFreeJersey(career, toTeamId);
    to.playerIds.push(player.id);
  } else {
    league.freeAgentIds.push(player.id);
  }
  career.incomingBids = career.incomingBids.filter((b) => b.playerId !== player.id);
  delete career.counters[player.id];
}

function scrubSelection(team: Team, playerId: string): void {
  const lineup = team.selection.lineup;
  lineup.starters = lineup.starters.map((id) => (id === playerId ? '' : id));
  lineup.bench = lineup.bench.filter((id) => id !== playerId);
}

function scrubUserSelection(career: Career, playerId: string): void {
  const sel = career.userSelection;
  if (!sel) return;
  sel.lineup.starters = sel.lineup.starters.map((id) => (id === playerId ? '' : id));
  sel.lineup.bench = sel.lineup.bench.filter((id) => id !== playerId);
  const takers = sel.tactics.setPieceTakers;
  for (const k of ['penalties', 'freeKicks', 'corners'] as const) if (takers[k] === playerId) takers[k] = null;
  if (sel.tactics.manMarkTarget === playerId) sel.tactics.manMarkTarget = null;
}

function goalkeepers(players: Player[]): number {
  return players.filter((p) => p.position === 'GK').length;
}

/** True when `player` is a keeper his club can't spare: it would drop below its minimum. */
function neededKeeper(career: Career, player: Player): boolean {
  return player.position === 'GK' && !!player.teamId && goalkeepers(squadOf(career, player.teamId)) <= T.minGoalkeepers;
}

/** Whether the user can lose this player without breaking the squad rules. */
export function canLose(career: Career, player: Player): string | null {
  const squad = squadOf(career, career.userTeamId);
  if (squad.length <= T.userMinSquad) return `You need at least ${T.userMinSquad} players.`;
  if (player.position === 'GK' && goalkeepers(squad) <= T.minGoalkeepers) return `You need at least ${T.minGoalkeepers} goalkeepers.`;
  if (career.loansIn.some((l) => l.playerId === player.id)) return 'He is on loan; he goes back at the end of the season.';
  return null;
}

function roomToSign(career: Career): string | null {
  return squadOf(career, career.userTeamId).length >= T.maxSquad ? `Your squad is full (${T.maxSquad}).` : null;
}

// ---------------------------------------------------------------------------
// User buying
// ---------------------------------------------------------------------------

/**
 * A bid for another club's player. The club accepts at or above its price
 * (or a counter it already made), counters at the midpoint when the bid is
 * close, and refuses otherwise. An accepted bid signs the player at once on
 * his wage demand for `years` seasons.
 */
export function bidForPlayer(career: Career, playerId: string, fee: number, years: number): DealResult {
  const player = career.season.league.players[playerId];
  const blocked = buyBlocked(career, player, fee);
  if (blocked) return fail(blocked);
  const seller = teamById(career.season.league, player.teamId!);

  const asking = userAskingPrice(career, player);
  const standing = career.counters[playerId];
  const target = Math.min(asking, standing ?? Infinity);
  if (fee < target) {
    // How close a bid must be is measured from the asking price, and a counter already
    // made stands: lower and lower bids can't walk the price down.
    if (fee >= asking * T.counterShare) {
      const counter = standing ?? roundMoney((fee + asking) / 2, 5000);
      career.counters[playerId] = counter;
      return { ok: false, message: `${seller.shortName} want ${money(counter)}.`, counter };
    }
    return fail(`${seller.shortName} turned it down. They value him far higher.`);
  }

  return completeBuy(career, player, fee, years);
}

/** Why the user can't buy this player for this fee now, or null. */
function buyBlocked(career: Career, player: Player | undefined, fee: number): string | null {
  if (!player || !player.teamId || player.teamId === career.userTeamId) return 'That player is not at another club.';
  if (!transferWindowOpen(career)) return 'The transfer window is shut.';
  const room = roomToSign(career);
  if (room) return room;
  const seller = teamById(career.season.league, player.teamId);
  if (seller.playerIds.length <= T.minSquad) return `${seller.shortName} have too few players to sell.`;
  if (neededKeeper(career, player)) return `${seller.shortName} won't sell a keeper they need.`;
  if (career.loansIn.some((l) => l.playerId === player.id)) return 'He is already with you on loan.';
  const wage = wageDemand(career, player, career.userTeamId);
  const limits = spendingLimits(career);
  if (limits.locked && fee > 0) return 'The spending lock forbids transfer fees.';
  if (fee > limits.maxFee) return `The lenders cap fees at ${money(limits.maxFee)}.`;
  if (wage > limits.maxWage) return `His wage demand (${money(wage)}) is over the lenders' limit.`;
  const books = userBooks(career);
  if (fee > books.cash) return `You have ${money(books.cash)} in the bank.`;
  return null;
}

function completeBuy(career: Career, player: Player, fee: number, years: number): DealResult {
  const seller = teamById(career.season.league, player.teamId!);
  const wage = wageDemand(career, player, career.userTeamId);
  spend(userBooks(career), 'transfers', fee);
  earn(career.books[seller.id], 'playerSales', fee);
  ownerMemory(career, seller.id, OWNER_MEMORY.buy);
  reportTransfer(career, { playerId: player.id, name: playerName(player), fromId: seller.id, toId: career.userTeamId, fee, how: 'fee' });
  movePlayer(career, player, career.userTeamId);
  player.contract = { wage, years: clamp(Math.round(years), T.contractYears.min, T.contractYears.max) };
  addInbox(career, 'transfer', `Signed ${playerName(player)}`, `${playerName(player)} joins from ${seller.shortName} for ${money(fee)} on ${money(wage)} a season for ${player.contract.years} years.`);
  return { ok: true, message: `${playerName(player)} has signed.` };
}

/** A deal already agreed at this fee (deadline day): the usual checks, no haggling. */
export function buyAtFee(career: Career, playerId: string, fee: number, years: number): DealResult {
  const player = career.season.league.players[playerId];
  const blocked = buyBlocked(career, player, fee);
  if (blocked) return fail(blocked);
  return completeBuy(career, player, fee, years);
}

export function signFreeAgent(career: Career, playerId: string, years: number): DealResult {
  const league = career.season.league;
  const player = league.players[playerId];
  if (!player || player.teamId !== null) return fail('He is not a free agent.');
  if (!freeAgentsOpen(career)) return fail('Free agents cannot sign during the run-in.');
  const room = roomToSign(career);
  if (room) return fail(room);
  const wage = wageDemand(career, player, career.userTeamId);
  if (wage > spendingLimits(career).maxWage) return fail(`His wage demand (${money(wage)}) is over the lenders' limit.`);
  reportTransfer(career, { playerId, name: playerName(player), fromId: null, toId: career.userTeamId, fee: 0, how: 'free' });
  movePlayer(career, player, career.userTeamId);
  player.contract = { wage, years: clamp(Math.round(years), T.contractYears.min, T.contractYears.max) };
  addInbox(career, 'transfer', `Signed ${playerName(player)}`, `${playerName(player)} joins on a free, on ${money(wage)} a season.`);
  return { ok: true, message: `${playerName(player)} has signed.` };
}

/** Loan fee the parent club asks. */
export function loanFee(player: Player): number {
  return roundMoney(player.value * C.loans.feeShare, 5000);
}

/**
 * A season-long loan. The parent lets fringe and rotation players go; the
 * user pays the fee now and `wageShare` of his wage while he is here. The
 * parent pays nothing toward his wage (a simplification).
 */
export function loanIn(career: Career, playerId: string, wageShare: number = C.loans.wageShare.default): DealResult {
  const league = career.season.league;
  const player = league.players[playerId];
  if (!player || !player.teamId || player.teamId === career.userTeamId) return fail('That player is not at another club.');
  if (!transferWindowOpen(career)) return fail('The transfer window is shut.');
  const room = roomToSign(career);
  if (room) return fail(room);
  if (career.loansIn.length >= C.loans.maxLoansIn) return fail(`You can have at most ${C.loans.maxLoansIn} players on loan.`);
  if (squadRole(career, player) === 'starter') return fail('His club will not loan out a starter.');
  const parent = teamById(league, player.teamId);
  if (parent.playerIds.length <= T.minSquad) return fail(`${parent.shortName} have too few players.`);
  if (neededKeeper(career, player)) return fail(`${parent.shortName} won't loan out a keeper they need.`);
  const share = clamp(wageShare, C.loans.wageShare.min, C.loans.wageShare.max);
  const fee = loanFee(player) * (1 + (C.loans.wageShare.max - share));
  const limits = spendingLimits(career);
  if (limits.locked && fee > 0) return fail('The spending lock forbids loan fees.');
  if (fee > limits.maxFee) return fail(`The lenders cap fees at ${money(limits.maxFee)}.`);
  if (player.contract.wage * share > limits.maxWage) return fail("His wage is over the lenders' limit.");
  const books = userBooks(career);
  if (fee > books.cash) return fail(`You have ${money(books.cash)} in the bank.`);
  spend(books, 'loanFees', fee);
  earn(career.books[parent.id], 'loanFees', fee);
  reportTransfer(career, { playerId, name: playerName(player), fromId: parent.id, toId: career.userTeamId, fee, how: 'loan' });
  movePlayer(career, player, career.userTeamId);
  career.loansIn.push({ playerId, fromTeamId: parent.id, wageShare: share });
  addInbox(career, 'transfer', `${playerName(player)} on loan`, `${playerName(player)} joins from ${parent.shortName} until the end of the season. Fee ${money(fee)}; you pay ${Math.round(share * 100)}% of his wage.`);
  return { ok: true, message: `${playerName(player)} arrives on loan.` };
}

/** Sends every loaned player home (end of season). */
export function endLoans(career: Career): void {
  const league = career.season.league;
  for (const loan of career.loansIn) {
    const player = league.players[loan.playerId];
    if (!player) continue;
    const parentExists = league.teams.some((t) => t.id === loan.fromTeamId);
    movePlayer(career, player, parentExists ? loan.fromTeamId : null);
  }
  career.loansIn = [];
}

// ---------------------------------------------------------------------------
// User selling and squad management
// ---------------------------------------------------------------------------

/** Cost of tearing up a contract: a share of the wages still owed. */
export function releaseCost(player: Player): number {
  return roundMoney(player.contract.wage * player.contract.years * T.releaseCostShare);
}

export function releasePlayer(career: Career, playerId: string): DealResult {
  const player = career.season.league.players[playerId];
  if (!player || player.teamId !== career.userTeamId) return fail('He is not your player.');
  const blocked = canLose(career, player);
  if (blocked) return fail(blocked);
  const cost = releaseCost(player);
  spend(userBooks(career), 'severance', cost);
  movePlayer(career, player, null);
  player.contract = { wage: wageFor(player), years: 1 };
  return { ok: true, message: `${playerName(player)} has been released (${money(cost)}).` };
}

/** The wage a player wants to extend and whether he is in the renewal window. */
export function renewalTerms(career: Career, player: Player): { wage: number; open: boolean } {
  return { wage: wageDemand(career, player, career.userTeamId), open: player.contract.years <= T.renewalWindowYears };
}

export function renewContract(career: Career, playerId: string, years: number): DealResult {
  const player = career.season.league.players[playerId];
  if (!player || player.teamId !== career.userTeamId) return fail('He is not your player.');
  if (career.loansIn.some((l) => l.playerId === playerId)) return fail('Loan players cannot be renewed.');
  const terms = renewalTerms(career, player);
  if (!terms.open) return fail(`Contracts can be extended in their last ${T.renewalWindowYears} year.`);
  if (terms.wage > spendingLimits(career).maxWage && terms.wage > player.contract.wage) return fail("His new wage is over the lenders' limit.");
  player.contract = { wage: terms.wage, years: player.contract.years + clamp(Math.round(years), T.contractYears.min, T.contractYears.max) };
  return { ok: true, message: `${playerName(player)} has extended to ${player.contract.years} years on ${money(terms.wage)}.` };
}

/** Clubs that could afford a fee, richest first. */
export function buyers(career: Career, exceptTeamId: string, fee: number): Team[] {
  return career.season.league.teams
    .filter((t) => t.id !== exceptTeamId && t.id !== career.userTeamId)
    .filter((t) => t.playerIds.length < T.maxSquad && career.books[t.id].cash * T.aiMaxFeeShareOfCash >= fee)
    .sort((a, b) => career.books[b.id].cash - career.books[a.id].cash);
}

function sellToAi(career: Career, player: Player, buyer: Team, fee: number, kind: string): void {
  const seller = player.teamId ? career.books[player.teamId] : null;
  spend(career.books[buyer.id], 'transfers', fee);
  if (seller) earn(seller, 'playerSales', fee);
  reportTransfer(career, { playerId: player.id, name: playerName(player), fromId: player.teamId, toId: buyer.id, fee, how: kind.startsWith('Forced') ? 'forced' : 'fee' });
  movePlayer(career, player, buyer.id);
  if (player.contract.years < 2) player.contract.years = 2;
  addInbox(career, 'transfer', `${playerName(player)} sold`, `${kind}: ${playerName(player)} joins ${buyer.shortName} for ${money(fee)}.`);
}

/** Hawks a player round the league: the best offer from a club that can pay, if any. */
export function offerToClubs(career: Career, playerId: string): DealResult {
  const player = career.season.league.players[playerId];
  if (!player || player.teamId !== career.userTeamId) return fail('He is not your player.');
  if (!transferWindowOpen(career)) return fail('The transfer window is shut.');
  const blocked = canLose(career, player);
  if (blocked) return fail(blocked);
  const rng = careerRng(career, `offer:${playerId}`);
  const share = rng.float(T.offerToClubsShare.min, T.offerToClubsShare.max);
  const fee = roundMoney(player.value * share, 5000);
  const buyer = buyers(career, career.userTeamId, fee)[0];
  if (!buyer) return fail('No club can afford him right now.');
  sellToAi(career, player, buyer, fee, 'Sold');
  return { ok: true, message: `${buyer.shortName} paid ${money(fee)} for ${playerName(player)}.` };
}

export function acceptBid(career: Career, bidId: string): DealResult {
  const bid = career.incomingBids.find((b) => b.id === bidId);
  if (!bid) return fail('That bid has lapsed.');
  const player = career.season.league.players[bid.playerId];
  if (!player || player.teamId !== career.userTeamId) {
    career.incomingBids = career.incomingBids.filter((b) => b.id !== bidId);
    return fail('He is no longer yours to sell.');
  }
  if (!transferWindowOpen(career) && !bid.listed) return fail('The transfer window is shut.');
  const blocked = canLose(career, player);
  if (blocked) return fail(blocked);
  const buyer = teamById(career.season.league, bid.fromTeamId);
  ownerMemory(career, buyer.id, OWNER_MEMORY.accept);
  sellToAi(career, player, buyer, bid.fee, 'Bid accepted');
  return { ok: true, message: `${playerName(player)} sold to ${buyer.shortName} for ${money(bid.fee)}.` };
}

/** Sells your player to a club at an agreed fee (a deadline-day late bid). */
export function sellAtFee(career: Career, playerId: string, buyerId: string, fee: number): DealResult {
  const player = career.season.league.players[playerId];
  if (!player || player.teamId !== career.userTeamId) return fail('He is no longer yours to sell.');
  if (!transferWindowOpen(career)) return fail('The transfer window is shut.');
  const blocked = canLose(career, player);
  if (blocked) return fail(blocked);
  const buyer = teamById(career.season.league, buyerId);
  if (buyer.playerIds.length >= T.maxSquad) return fail(`${buyer.shortName} have no room left.`);
  ownerMemory(career, buyer.id, OWNER_MEMORY.accept);
  sellToAi(career, player, buyer, fee, 'Deadline deal');
  return { ok: true, message: `${playerName(player)} sold to ${buyer.shortName} for ${money(fee)}.` };
}

/** One AI club buys another's player (a deadline-day hijack or the late flurry). */
export function aiTransfer(career: Career, player: Player, buyer: Team, fee: number, rng: Rng): void {
  const wage = wageDemand(career, player, buyer.id);
  sellToAiSilently(career, player, buyer, fee);
  player.contract = { wage, years: rng.int(2, 4) };
}

/** One more round of AI deals (deadline day's last-minute flurry). */
export function aiDealsRound(career: Career, rng: Rng): void {
  aiDeals(career, rng);
}

export function rejectBid(career: Career, bidId: string): void {
  const bid = career.incomingBids.find((b) => b.id === bidId);
  if (bid) ownerMemory(career, bid.fromTeamId, OWNER_MEMORY.reject);
  career.incomingBids = career.incomingBids.filter((b) => b.id !== bidId);
}

// ---------------------------------------------------------------------------
// The weekly market (called by the calendar)
// ---------------------------------------------------------------------------

/** Lapses old bids, maybe brings a new one, runs AI deals and forced sales, and keeps the user's squad playable. */
export function weeklyMarket(career: Career): void {
  career.incomingBids = career.incomingBids.filter((b) => b.expiresWeek >= career.weekIndex);
  if (transferWindowOpen(career)) {
    maybeIncomingBid(career, careerRng(career, 'bid'));
    aiDeals(career, careerRng(career, 'ai-deals'));
  } else {
    career.counters = {};
    // Bids you asked for stand until they lapse; the rest wait for the window.
    career.incomingBids = career.incomingBids.filter((b) => b.listed);
  }
  if (freeAgentsOpen(career)) aiFreeSignings(career);
  forcedSale(career);
  emergencyFill(career);
}

function maybeIncomingBid(career: Career, rng: Rng): void {
  if (!rng.chance(T.incomingBidsPerWeek)) return;
  const squad = squadOf(career, career.userTeamId).filter(
    (p) => !career.loansIn.some((l) => l.playerId === p.id) && !career.incomingBids.some((b) => b.playerId === p.id),
  );
  if (squad.length === 0) return;
  const player = rng.weighted(squad, (p) => Math.pow(Math.max(1, p.overall - 35), 2));
  const share = rng.float(T.incomingBidShare.min, T.incomingBidShare.max);
  let fee = roundMoney(player.value * share, 5000);
  const options = buyers(career, career.userTeamId, fee);
  if (options.length === 0) return;
  const buyer = rng.pick(options.slice(0, 4));
  fee = roundMoney(fee * bidFactor(career, buyer.id), 5000);
  career.incomingBids.push({ id: nextId(career, 'bid'), playerId: player.id, fromTeamId: buyer.id, fee, expiresWeek: career.weekIndex + T.bidExpiryWeeks });
  addInbox(career, 'bid', `Bid for ${playerName(player)}`, `${buyer.shortName} offer ${money(fee)} for ${playerName(player)}. It lapses in ${T.bidExpiryWeeks} weeks.`);
}

/** A club bids for one of your players at a share of his value (a transfer request, a lender's push to sell). False if no club can afford him. */
export function bidForListed(career: Career, player: Player, share: number, rng: Rng): boolean {
  if (career.incomingBids.some((b) => b.playerId === player.id)) return true;
  const base = roundMoney(player.value * share, 5000);
  const options = buyers(career, career.userTeamId, base);
  if (options.length === 0) {
    addInbox(career, 'bid', `No takers for ${playerName(player)}`, `Clubs were told ${playerName(player)} is available, but none can afford ${money(base)} right now.`);
    return false;
  }
  const buyer = rng.pick(options.slice(0, 4));
  const fee = roundMoney(base * bidFactor(career, buyer.id), 5000);
  career.incomingBids.push({ id: nextId(career, 'bid'), playerId: player.id, fromTeamId: buyer.id, fee, expiresWeek: career.weekIndex + T.bidExpiryWeeks, listed: true });
  addInbox(career, 'bid', `Bid for ${playerName(player)}`, `${buyer.shortName} offer ${money(fee)} for ${playerName(player)}. It lapses in ${T.bidExpiryWeeks} weeks.`);
  return true;
}

/** Starting-eleven average at a position for a club, used to find where an AI club is weakest. */
function bestAt(players: Player[], position: Position): number {
  const at = players.filter((p) => p.position === position).map((p) => p.overall).sort((a, b) => b - a);
  return at[0] ?? 0;
}

const MARKET_POSITIONS: Position[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];

/** AI clubs buy from each other to fix their weakest position. */
function aiDeals(career: Career, rng: Rng): void {
  const league = career.season.league;
  for (const buyer of league.teams) {
    if (buyer.id === career.userTeamId || !rng.chance(T.aiDealsPerClubPerWeek)) continue;
    if (buyer.playerIds.length >= T.maxSquad) continue;
    const squad = squadOf(career, buyer.id);
    const weakest = MARKET_POSITIONS.map((pos) => ({ pos, best: bestAt(squad, pos) })).sort((a, b) => a.best - b.best)[0];
    const budget = career.books[buyer.id].cash * T.aiMaxFeeShareOfCash;
    const targets = Object.values(league.players).filter((p) => {
      if (!p.teamId || p.teamId === buyer.id || p.teamId === career.userTeamId) return false;
      if (p.position !== weakest.pos || p.overall <= weakest.best + 2) return false;
      if (career.loansIn.some((l) => l.playerId === p.id)) return false;
      return teamById(league, p.teamId).playerIds.length > T.minSquad && !neededKeeper(career, p);
    });
    const affordable = targets.map((p) => ({ p, fee: askingPrice(career, p) })).filter((t) => t.fee <= budget);
    if (affordable.length === 0) continue;
    const pick = rng.weighted(affordable, (t) => t.p.overall);
    const wage = wageDemand(career, pick.p, buyer.id);
    sellToAiSilently(career, pick.p, buyer, pick.fee);
    pick.p.contract = { wage, years: rng.int(2, 4) };
  }
}

function sellToAiSilently(career: Career, player: Player, buyer: Team, fee: number): void {
  if (player.teamId) earn(career.books[player.teamId], 'playerSales', fee);
  spend(career.books[buyer.id], 'transfers', fee);
  reportTransfer(career, { playerId: player.id, name: playerName(player), fromId: player.teamId, toId: buyer.id, fee, how: 'fee' });
  movePlayer(career, player, buyer.id);
}

/** AI clubs under their target size sign the best free agent they can use. */
function aiFreeSignings(career: Career): void {
  const league = career.season.league;
  for (const team of league.teams) {
    if (team.id === career.userTeamId) continue;
    while (team.playerIds.length < C.aiSquads.targetSize && team.playerIds.length < T.maxSquad) {
      const squad = squadOf(career, team.id);
      const needGk = goalkeepers(squad) < T.minGoalkeepers;
      const pool = league.freeAgentIds.map((id) => league.players[id]).filter((p): p is Player => !!p && (!needGk || p.position === 'GK'));
      if (pool.length === 0) break;
      const best = pool.sort((a, b) => b.overall - a.overall)[0];
      movePlayer(career, best, team.id);
      best.contract = { wage: wageFor(best), years: 1 + (best.age < 30 ? 1 : 0) };
    }
  }
}

/** Ladder level 4: the lenders sell your most valuable player at a discount every few weeks. */
function forcedSale(career: Career): void {
  const L = C.ladder;
  const ladder = career.ladder;
  if (ladder.level !== 4) return;
  if (ladder.lastForcedSaleWeek !== null && career.weekIndex - ladder.lastForcedSaleWeek < L.forcedSaleEveryWeeks) return;
  const squad = squadOf(career, career.userTeamId)
    .filter((p) => !career.loansIn.some((l) => l.playerId === p.id))
    .filter((p) => p.position !== 'GK' || goalkeepers(squadOf(career, career.userTeamId)) > T.minGoalkeepers)
    .sort((a, b) => b.value - a.value);
  const player = squad[0];
  if (!player) return;
  const fee = roundMoney(player.value * L.forcedSaleShare, 5000);
  const buyer = career.season.league.teams
    .filter((t) => t.id !== career.userTeamId && t.playerIds.length < T.maxSquad)
    .sort((a, b) => career.books[b.id].cash - career.books[a.id].cash)[0];
  if (!buyer) return;
  ladder.lastForcedSaleWeek = career.weekIndex;
  sellToAi(career, player, buyer, fee, 'Forced sale by the lenders');
}

/**
 * Keeps the user's squad playable: below the floor (or short of goalkeepers)
 * the league assigns free agents on one-year minimum deals, generating new
 * ones if the pool runs dry. A documented safety net, not a tactic.
 */
export function emergencyFill(career: Career): void {
  const league = career.season.league;
  const signed: string[] = [];
  for (let guard = 0; guard < 30; guard++) {
    const squad = squadOf(career, career.userTeamId);
    const needGk = goalkeepers(squad) < T.minGoalkeepers;
    if (!needGk && squad.length >= T.emergencyFillTo) break;
    const pool = league.freeAgentIds.map((id) => league.players[id]).filter((p): p is Player => !!p && (!needGk || p.position === 'GK'));
    let player = pool.sort((a, b) => b.overall - a.overall)[0];
    if (!player) player = generateFreeAgent(career, needGk ? 'GK' : rngPosition(career, guard));
    movePlayer(career, player, career.userTeamId);
    player.contract = { wage: T.minWage, years: 1 };
    signed.push(playerName(player));
  }
  if (signed.length > 0) {
    addInbox(career, 'transfer', 'Emergency signings', `Your squad was too thin to play, so the league placed ${signed.join(', ')} with you on one-year minimum deals.`);
  }
}

function rngPosition(career: Career, salt: number): Position {
  return careerRng(career, `fill-pos:${salt}`).pick(MARKET_POSITIONS.filter((p) => p !== 'GK'));
}

/** A fresh, modest free agent added to the league (used when the pool has nobody suitable). */
export function generateFreeAgent(career: Career, position: Position, quality = 0.25): Player {
  const league = career.season.league;
  const ids = makeIdFactory(league.nextId);
  const rng = careerRng(career, `gen-fa:${league.nextId}`);
  const player = generatePlayer(rng, { position, nationality: homeNationId(), quality, tier: 'rotation' }, ids, defaultNames);
  league.nextId = ids.current();
  league.players[player.id] = player;
  league.freeAgentIds.push(player.id);
  return player;
}

/** Players who count toward the homegrown rule. */
export function homegrownCount(career: Career, teamId: string): number {
  return squadOf(career, teamId).filter((p) => isDomestic(p.nationality)).length;
}
