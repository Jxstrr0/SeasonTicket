/**
 * Club money: weekly running costs and income, gate receipts, debts and the
 * overdraft, owner injections, season-end prizes, the wage cap and the
 * lender ladder. Every club keeps books; only the user's club can borrow
 * from the ladder lenders or get into ladder trouble. AI owners quietly top
 * up their clubs so the league stays whole (a documented simplification).
 */
import { teamById } from '../league';
import type { MatchResult, ScheduledMatch, Team } from '../types';
import { boxUpkeep, concessionsBonus, hospitalityPerMatch, merchandiseMultiplier, sponsorMultiplier, tvBonus } from './stadium';
import type { Career, ClubBooks, Debt } from './types';
import { C, WEEKS_PER_YEAR, addInbox, clamp, earn, finance, ledgerTotals, money, nextId, roundMoney, spend, userBooks } from './util';

type Lender = (typeof C.lenders.list)[number];

// ---------------------------------------------------------------------------
// Prices and yearly amounts
// ---------------------------------------------------------------------------

/** The ticket price the local market expects; AI clubs charge exactly this. */
export function fairPrice(team: Team): number {
  return Math.round((C.tickets.fairBase + C.tickets.fairPerMarket * team.marketSize) * 100) / 100;
}

/** Attendance share after the user's ticket price: dearer than fair empties seats, cheaper fills them. */
export function priceAdjustedShare(baseShare: number, price: number, fair: number): number {
  const ratio = fair / Math.max(C.tickets.minPrice, price);
  return clamp(baseShare * Math.pow(ratio, C.tickets.elasticity), C.tickets.minShare, 1);
}

/** Yearly player payroll; loaned-in players count at the share the club pays. */
export function playerPayroll(career: Career, teamId: string): number {
  const league = career.season.league;
  const loans = teamId === career.userTeamId ? new Map(career.loansIn.map((l) => [l.playerId, l.wageShare])) : new Map<string, number>();
  let total = 0;
  for (const id of teamById(league, teamId).playerIds) {
    const p = league.players[id];
    if (p) total += p.contract.wage * (loans.get(id) ?? 1);
  }
  return total;
}

export function staffPayroll(career: Career, teamId: string): number {
  const league = career.season.league;
  let total = 0;
  for (const id of teamById(league, teamId).staffIds) total += league.staff[id]?.contract.wage ?? 0;
  return total;
}

export function operationsCost(team: Team): number {
  return C.operations.base + C.operations.perSeat * team.stadiumCapacity;
}

export function merchandiseIncome(team: Team): number {
  const m = C.merchandise;
  return m.base + m.perMarket * Math.pow(team.marketSize, m.exponent) * team.fanMood;
}

/** The middle of the shirt-sponsor range for a market; AI clubs earn this. */
export function sponsorValue(team: Team): number {
  const s = C.sponsors;
  return s.base + s.perMarket * Math.pow(team.marketSize, s.exponent);
}

export function academyUpkeep(books: ClubBooks): number {
  return C.youth.upkeepByLevel[clamp(books.academyLevel, 1, C.youth.upkeepByLevel.length) - 1];
}

/** What a full season of gate money looks like at the fair price and an average crowd. */
export function estimatedGate(team: Team, attendance = 0.65): number {
  const homeGames = 15;
  const crowd = team.stadiumCapacity * attendance;
  return homeGames * crowd * (fairPrice(team) + C.matchday.concessionsPerHead - C.matchday.costPerHead);
}

/** Last season's income, or a fair estimate before the first season ends. */
export function revenueBasis(career: Career, teamId: string): number {
  const books = career.books[teamId];
  if (books.lastLedger) return ledgerTotals(books.lastLedger).income;
  const team = teamById(career.season.league, teamId);
  return C.income.tv + sponsorValue(team) + merchandiseIncome(team) + estimatedGate(team);
}

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

/** One week of every club's running money: wages, staff, operations, academy, TV, sponsor, merchandise and debts. */
export function weeklyBooks(career: Career): void {
  const league = career.season.league;
  for (const team of league.teams) {
    const books = career.books[team.id];
    const payroll = playerPayroll(career, team.id);
    spend(books, 'playerWages', payroll / WEEKS_PER_YEAR);
    spend(books, 'staffWages', staffPayroll(career, team.id) / WEEKS_PER_YEAR);
    const stadium = career.stadiums[team.id];
    spend(books, 'operations', (operationsCost(team) + boxUpkeep(stadium)) / WEEKS_PER_YEAR);
    spend(books, 'academy', academyUpkeep(books) / WEEKS_PER_YEAR);
    earn(books, 'tv', (C.income.tv + tvBonus(stadium)) / WEEKS_PER_YEAR);
    const sponsor = team.id === career.userTeamId ? books.sponsor?.perSeason ?? 0 : sponsorValue(team);
    earn(books, 'sponsors', (sponsor * sponsorMultiplier(stadium)) / WEEKS_PER_YEAR);
    earn(books, 'merchandise', (merchandiseIncome(team) * merchandiseMultiplier(stadium)) / WEEKS_PER_YEAR);
    books.payrollAccum += payroll;
    books.payrollWeeks += 1;
    serviceDebts(career, books);
    if (books.cash < 0) spend(books, 'interest', (-books.cash * C.lenders.overdraftRate) / WEEKS_PER_YEAR);
    if (team.id !== career.userTeamId && books.cash < 0) finance(books, 'ownerInjection', -books.cash);
  }
}

// ---------------------------------------------------------------------------
// Match days
// ---------------------------------------------------------------------------

/** Ticket price the home club charges for a match. */
export function matchPrice(career: Career, homeId: string, playoff: boolean): number {
  const team = teamById(career.season.league, homeId);
  const base = homeId === career.userTeamId ? career.books[homeId].ticketPrice : fairPrice(team);
  return base * (playoff ? C.tickets.playoffPriceMultiplier : 1);
}

/** Gate, concessions and match-day staff for the home club, then fan mood for both. */
export function settleMatch(career: Career, match: ScheduledMatch, result: MatchResult): void {
  const league = career.season.league;
  const home = teamById(league, match.homeId);
  const away = teamById(league, match.awayId);
  const playoff = match.stage !== 'league';
  const books = career.books[home.id];
  const crowd = Math.round(result.attendanceShare * home.stadiumCapacity);
  result.crowd = crowd;
  earn(books, 'tickets', crowd * matchPrice(career, home.id, playoff));
  const stadium = career.stadiums[home.id];
  earn(books, 'concessions', crowd * (C.matchday.concessionsPerHead + concessionsBonus(stadium)));
  earn(books, 'hospitality', hospitalityPerMatch(home, stadium) * (playoff ? C.tickets.playoffPriceMultiplier : 1));
  spend(books, 'matchday', crowd * C.matchday.costPerHead);

  const outcome = (teamId: string) => (result.winnerId === null ? 'draw' : result.winnerId === teamId ? 'win' : 'loss');
  for (const team of [home, away]) {
    const f = C.fans;
    let mood = team.fanMood + f[outcome(team.id)];
    if (team.id === home.id && team.id === career.userTeamId) {
      const over = career.books[team.id].ticketPrice / fairPrice(team) - 1;
      if (over > 0) mood -= (over / 0.1) * f.pricePenaltyPerOverFair;
    }
    mood += (career.books[team.id].baseFanMood - mood) * f.drift;
    team.fanMood = clamp(mood, f.min, f.max);
  }
}

// ---------------------------------------------------------------------------
// Debt
// ---------------------------------------------------------------------------

export function lender(id: string): Lender {
  const l = C.lenders.list.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown lender ${id}`);
  return l;
}

/** Level weekly payment that clears the loan over its term. */
export function annuityPayment(principal: number, yearlyRate: number, weeks: number): number {
  const r = yearlyRate / WEEKS_PER_YEAR;
  if (r === 0) return principal / weeks;
  return (principal * r) / (1 - Math.pow(1 + r, -weeks));
}

export function totalDebt(books: ClubBooks): number {
  return books.debts.reduce((sum, d) => sum + d.balance, 0);
}

export function newDebt(career: Career, lenderId: string, amount: number): Debt {
  const l = lender(lenderId);
  const weeks = l.seasons * WEEKS_PER_YEAR;
  return {
    id: nextId(career, 'd'),
    lenderId,
    balance: amount,
    rate: l.rate,
    weeklyPayment: annuityPayment(amount, l.rate, weeks),
    weeksLeft: weeks,
    minCash: l.minCashCondition,
  };
}

function serviceDebts(career: Career, books: ClubBooks): void {
  for (const debt of books.debts) {
    const interest = (debt.balance * debt.rate) / WEEKS_PER_YEAR;
    const principal = Math.min(debt.balance, Math.max(0, debt.weeklyPayment - interest));
    spend(books, 'interest', interest);
    finance(books, 'repaid', principal);
    debt.balance -= principal;
    debt.weeksLeft -= 1;
    if (debt.weeksLeft <= 0 && debt.balance > 0) {
      finance(books, 'repaid', debt.balance);
      debt.balance = 0;
    }
  }
  const before = books.debts.length;
  books.debts = books.debts.filter((d) => d.balance > 0.5);
  if (books.teamId === career.userTeamId && books.debts.length < before) {
    addInbox(career, 'finance', 'Loan paid off', 'A loan has been repaid in full.');
  }
}

export interface BorrowOption {
  lender: Lender;
  max: number;
  available: boolean;
  reason: string | null;
}

/** What each lender would offer the user's club right now. */
export function borrowOptions(career: Career): BorrowOption[] {
  const books = userBooks(career);
  const revenue = revenueBasis(career, career.userTeamId);
  const owed = totalDebt(books);
  return C.lenders.list.map((l) => {
    const max = Math.max(0, roundMoney(l.maxPerRevenue * revenue - owed, 50_000));
    let reason: string | null = null;
    if (l.needsClean && career.ladder.level > 0) reason = 'Only lends to clubs in good standing.';
    else if (max < C.lenders.minLoan) reason = 'Your existing debt is already at their limit.';
    else if (career.ladder.level >= 4) reason = 'Nobody lends to a club in forced sales.';
    return { lender: l, max, available: reason === null, reason };
  });
}

export function borrow(career: Career, lenderId: string, amount: number): { ok: boolean; message: string } {
  const option = borrowOptions(career).find((o) => o.lender.id === lenderId);
  if (!option) return { ok: false, message: 'Unknown lender.' };
  if (!option.available) return { ok: false, message: option.reason ?? 'Not available.' };
  const value = roundMoney(amount, 10_000);
  if (value < C.lenders.minLoan) return { ok: false, message: `The smallest loan is ${money(C.lenders.minLoan)}.` };
  if (value > option.max) return { ok: false, message: `${option.lender.name} will lend at most ${money(option.max)}.` };
  const books = userBooks(career);
  books.debts.push(newDebt(career, lenderId, value));
  finance(books, 'borrowed', value);
  const l = option.lender;
  const condition = l.minCashCondition > 0 ? ` You must keep at least ${money(l.minCashCondition)} in the bank while it is open.` : '';
  addInbox(career, 'finance', `Loan from ${l.name}`, `${money(value)} at ${Math.round(l.rate * 100)}% a year over ${l.seasons} seasons.${condition}`);
  return { ok: true, message: `Borrowed ${money(value)} from ${l.name}.` };
}

/** Pay a loan down early, in full or in part. */
export function repayDebt(career: Career, debtId: string, amount: number): { ok: boolean; message: string } {
  const books = userBooks(career);
  const debt = books.debts.find((d) => d.id === debtId);
  if (!debt) return { ok: false, message: 'No such loan.' };
  const value = Math.min(debt.balance, Math.max(0, amount));
  if (value <= 0) return { ok: false, message: 'Nothing to repay.' };
  if (value > books.cash) return { ok: false, message: 'Not enough cash.' };
  finance(books, 'repaid', value);
  debt.balance -= value;
  if (debt.balance <= 0.5) {
    books.debts = books.debts.filter((d) => d !== debt);
    return { ok: true, message: `Loan cleared.` };
  }
  debt.weeklyPayment = annuityPayment(debt.balance, debt.rate, Math.max(1, debt.weeksLeft));
  return { ok: true, message: `Repaid ${money(value)}.` };
}

// ---------------------------------------------------------------------------
// The owner
// ---------------------------------------------------------------------------

export function injectCash(career: Career, amount: number): { ok: boolean; message: string } {
  const value = roundMoney(amount, 10_000);
  if (value < C.owner.minInjection) return { ok: false, message: `Put in at least ${money(C.owner.minInjection)}.` };
  if (value > career.owner.fortune) return { ok: false, message: `You only have ${money(career.owner.fortune)} left.` };
  career.owner.fortune -= value;
  career.owner.injected += value;
  finance(userBooks(career), 'ownerInjection', value);
  return { ok: true, message: `You put ${money(value)} of your own money into the club.` };
}

// ---------------------------------------------------------------------------
// Season end
// ---------------------------------------------------------------------------

/** Prize money, playoff money and the luxury tax, paid when the champion is crowned. */
export function settleSeason(career: Career): void {
  const state = career.season;
  const W = C.wageCap;
  state.standings.forEach((row, i) => earn(career.books[row.teamId], 'merit', C.income.merit[i] ?? 0));
  for (const [teamId, amount] of playoffPrizes(career)) earn(career.books[teamId], 'playoffs', amount);

  let pot = 0;
  const under: ClubBooks[] = [];
  for (const team of state.league.teams) {
    const books = career.books[team.id];
    const average = books.payrollWeeks > 0 ? books.payrollAccum / books.payrollWeeks : playerPayroll(career, team.id);
    const over = average - W.cap;
    if (over > 0) {
      const rate = books.overCapSeasons >= W.repeatAfterSeasons ? W.repeatTaxRate : W.taxRate;
      const tax = over * rate;
      spend(books, 'luxuryTax', tax);
      pot += tax;
      books.overCapSeasons += 1;
      if (team.id === career.userTeamId) {
        addInbox(career, 'finance', 'Luxury tax', `Your average payroll was ${money(average)}, ${money(over)} over the ${money(W.cap)} cap. Tax: ${money(tax)}.`);
      }
    } else {
      books.overCapSeasons = 0;
      under.push(books);
    }
    books.payrollAccum = 0;
    books.payrollWeeks = 0;
  }
  if (pot > 0 && under.length > 0) for (const books of under) earn(books, 'luxuryShare', pot / under.length);

  const f = C.fans;
  const bump = (teamId: string | null, amount: number) => {
    if (!teamId) return;
    const team = teamById(state.league, teamId);
    team.fanMood = clamp(team.fanMood + amount, f.min, f.max);
  };
  bump(state.shieldWinnerId, f.title);
  bump(state.championId, f.playoffTitle);
}

function playoffPrizes(career: Career): Map<string, number> {
  const P = C.income.playoffs;
  const out = new Map<string, number>();
  const bracket = career.season.bracket;
  if (!bracket) return out;
  const add = (id: string, amount: number) => out.set(id, (out.get(id) ?? 0) + amount);
  bracket.seeds.slice(0, 2).forEach((id) => add(id, P.bye));
  for (const m of bracket.quarterFinals) [m.homeId, m.awayId].forEach((id) => add(id, P.quarterFinal));
  for (const m of bracket.semiFinals) [m.homeId, m.awayId].forEach((id) => add(id, P.semiFinal));
  if (bracket.final?.result) {
    const winner = bracket.final.result.winnerId;
    for (const id of [bracket.final.homeId, bracket.final.awayId]) add(id, id === winner ? P.champion : P.runnerUp);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The lender ladder (user's club only)
// ---------------------------------------------------------------------------

export const LADDER_NAMES = ['Good standing', 'Warning letter', 'Lender CFO', 'Spending lock', 'Forced sales', 'Receivership'];

export function inBreach(career: Career): boolean {
  const books = userBooks(career);
  return books.cash < 0 || books.debts.some((d) => d.minCash > 0 && books.cash < d.minCash);
}

/** Spending limits the ladder imposes on transfers and wages. */
export function spendingLimits(career: Career): { maxFee: number; maxWage: number; locked: boolean } {
  const L = C.ladder;
  const level = career.ladder.level;
  if (level >= 3) return { maxFee: 0, maxWage: L.lockMaxWage, locked: true };
  if (level >= 2) return { maxFee: L.cfo.maxFee, maxWage: L.cfo.maxWage, locked: false };
  return { maxFee: Infinity, maxWage: Infinity, locked: false };
}

/**
 * Called once a week after the money moves. A breach starts a deadline;
 * missing it climbs a rung; enough clean weeks step back down. Returns true
 * when the club has gone into receivership.
 */
export function updateLadder(career: Career): boolean {
  const L = C.ladder;
  const ladder = career.ladder;
  const books = userBooks(career);
  if (books.cash < -L.receivershipOverdraft) {
    ladder.level = 5;
    return true;
  }
  if (inBreach(career)) {
    ladder.goodWeeks = 0;
    if (ladder.level === 0) {
      climb(career, 1);
    } else if (ladder.deadlineWeek === null) {
      ladder.deadlineWeek = career.weekIndex + L.deadlineWeeks;
    } else if (career.weekIndex >= ladder.deadlineWeek) {
      climb(career, ladder.level + 1);
    }
  } else {
    ladder.deadlineWeek = null;
    if (ladder.level > 0) {
      ladder.goodWeeks += 1;
      if (ladder.goodWeeks >= L.goodWeeksToRecover) {
        ladder.level -= 1;
        ladder.goodWeeks = 0;
        addInbox(career, 'ladder', 'The lenders ease off', `Your club is back to: ${LADDER_NAMES[ladder.level]}.`);
      }
    }
  }
  return ladder.level >= 5;
}

function climb(career: Career, level: number): void {
  const L = C.ladder;
  const ladder = career.ladder;
  ladder.level = Math.min(5, level);
  ladder.deadlineWeek = career.weekIndex + L.deadlineWeeks;
  const fix = `Get your cash above zero${userBooks(career).debts.some((d) => d.minCash > 0) ? ' and above your loan conditions' : ''} within ${L.deadlineWeeks} weeks.`;
  const text: Record<number, string> = {
    1: `The lenders have written to you. ${fix}`,
    2: `The lenders have put their own finance chief into your office. Transfer fees are capped at ${money(L.cfo.maxFee)} and wages at ${money(L.cfo.maxWage)}. ${fix}`,
    3: `Spending lock: no transfer fees, no upgrades, no new staff, and wages at most ${money(L.lockMaxWage)}. ${fix}`,
    4: `Forced sales: the lenders will sell a player every ${L.forcedSaleEveryWeeks} weeks until the books recover. ${fix}`,
    5: 'The club has gone into receivership.',
  };
  addInbox(career, 'ladder', LADDER_NAMES[ladder.level], text[ladder.level] ?? '');
}
