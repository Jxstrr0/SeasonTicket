/**
 * Long careers for the balance pass (Stage 7.3). A scripted owner runs a club for up to ten
 * seasons, headless, and every season's numbers are kept: where the club finished, its cash,
 * debt and the owner's fortune, wages against the cap, where the money came from and went,
 * and the league around it (who won, how strong they were, the youth intake, ages).
 *
 * Bundled with Vite and imported natively by tests/slow/careers.slow.test.ts, for the same
 * reason as seasonBench.ts: under Vitest's import transform the match engine runs several
 * times slower than it does in the game.
 *
 * The three owners:
 * - careful: keeps a cash buffer (putting in their own money when it runs low), pays fair
 *   wages under the cap, sells surplus players for good fees and buys only what it can afford;
 * - reckless: borrows all it can, buys the best players it can reach on long deals whatever
 *   the wages, and puts its own money in only when the lenders are already writing;
 * - idle: does nothing at all; the staff and the season run the club;
 * - builder: the careful owner who also, each pre-season, spends spare cash on the academy and the
 *   ground (more seats when the crowds fill it, else a roof, boxes or the fan upgrades), to see
 *   whether those pay back.
 */
import { simulateSpatialMatch } from '../../src/sim/spatial/bridge';
import { simulateMatch } from '../helpers/stage1/engine';
import type { SpatialMode } from '../../src/sim/spatial/types';
import type { Player } from '../../src/sim/types';
import { careerProblem } from '../../src/game/saveCheck';
import {
  C,
  academyUpgradeCost,
  acceptBid,
  advanceCareer,
  averageHomeCrowd,
  bidForPlayer,
  borrow,
  borrowOptions,
  continueToNextSeason,
  createCareer,
  injectCash,
  orderProject,
  inBreach,
  ledgerTotals,
  playerPayroll,
  releasePlayer,
  renewContract,
  renewalTerms,
  revenueBasis,
  setBackgroundEngine,
  squadOf,
  stadiumOptions,
  totalDebt,
  transferWindowOpen,
  upgradeAcademy,
  userAskingPrice,
  userBooks,
  wageDemand,
  type Career,
  type TierId,
} from '../../src/sim/career';

export type OwnerStyle = 'careful' | 'reckless' | 'idle' | 'builder';

export interface SeasonLine {
  season: number;
  position: number;
  points: number;
  /** Won the league table (the shield) / the playoffs (the title). */
  shield: boolean;
  title: boolean;
  /** Strength rank (1 = best eleven) at the start of the season, and the shield winner's. */
  strengthRank: number;
  shieldWinnerRank: number;
  championRank: number;
  cash: number;
  debt: number;
  fortune: number;
  injected: number;
  /** Highest lender-ladder rung during the season. */
  maxLadder: number;
  payroll: number;
  income: number;
  spending: number;
  incomeBy: Record<string, number>;
  spendingBy: Record<string, number>;
  feesPaid: number;
  feesReceived: number;
  bestElevenAvg: number;
  /** League-wide: the average best eleven and average age, to spot drift over the years. */
  leagueElevenAvg: number;
  leagueAge: number;
  /** The intake that joined the academy this summer: count, average overall and potential. */
  youth: { n: number; overall: number; potential: number };
  attendance: number;
  fanMood: number;
}

export interface CareerRun {
  tier: TierId;
  club: string;
  style: OwnerStyle;
  seed: number;
  /** The season (1-based) the club was lost in, or null. */
  lost: number | null;
  seasons: SeasonLine[];
  /** How many times each story event was drawn over the whole career (chain steps included). */
  events: Record<string, number>;
  ms: number;
}

const bestEleven = (players: Player[]): number => {
  const top = players.map((p) => p.overall).sort((a, b) => b - a).slice(0, 11);
  return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
};

function strengthRanks(career: Career): Map<string, number> {
  const teams = career.season.league.teams.map((t) => ({ id: t.id, s: bestEleven(squadOf(career, t.id)) })).sort((a, b) => b.s - a.s);
  return new Map(teams.map((t, i) => [t.id, i + 1]));
}

// ---------------------------------------------------------------------------
// The owners
// ---------------------------------------------------------------------------

function buffer(career: Career): number {
  return Math.max(500_000, 0.12 * revenueBasis(career, career.userTeamId));
}

function topUp(career: Career, target: number): void {
  const books = userBooks(career);
  const need = target - books.cash;
  if (need <= 0) return;
  const amount = Math.min(career.owner.fortune, Math.max(need, C.owner.minInjection));
  if (amount >= C.owner.minInjection) injectCash(career, Math.round(amount));
}

/** Players worth having over this squad's weakest regular at their position. */
function upgrades(career: Career, budget: number, wageRoom: number, minGain: number): { p: Player; fee: number; gain: number }[] {
  const mine = squadOf(career, career.userTeamId);
  const league = career.season.league;
  const out: { p: Player; fee: number; gain: number }[] = [];
  for (const p of Object.values(league.players)) {
    if (!p.teamId || p.teamId === career.userTeamId || p.age > 31) continue;
    const same = mine.filter((m) => m.position === p.position).sort((a, b) => b.overall - a.overall);
    const regulars = p.position === 'GK' ? 1 : p.position === 'CB' ? 2 : 2;
    const weakest = same[Math.min(regulars, same.length) - 1]?.overall ?? 0;
    const gain = p.overall - weakest;
    if (gain < minGain) continue;
    const fee = userAskingPrice(career, p);
    if (fee > budget || wageDemand(career, p, career.userTeamId) > wageRoom) continue;
    out.push({ p, fee, gain });
  }
  return out;
}

function makeRoom(career: Career): void {
  const squad = squadOf(career, career.userTeamId);
  if (squad.length < C.transfers.maxSquad) return;
  const worst = squad.filter((p) => p.position !== 'GK').sort((a, b) => a.overall - b.overall)[0];
  if (worst) releasePlayer(career, worst.id);
}

function carefulWeek(career: Career, windowWeek: boolean): void {
  const books = userBooks(career);
  const cushion = buffer(career);
  topUp(career, cushion);
  // Sell surplus for good money: anyone outside the best sixteen, or past thirty, at a fair fee.
  const ranked = squadOf(career, career.userTeamId).sort((a, b) => b.overall - a.overall);
  const core = new Set(ranked.slice(0, 16).map((p) => p.id));
  for (const bid of career.incomingBids.slice()) {
    const p = career.season.league.players[bid.playerId];
    if (!p) continue;
    if ((!core.has(p.id) || p.age >= 31) && bid.fee >= p.value * 1.05) acceptBid(career, bid.id);
  }
  if (!windowWeek || !transferWindowOpen(career)) return;
  // Buy within means: half the cash over the cushion, wages that keep the payroll under the cap.
  for (let k = 0; k < 2; k++) {
    const budget = (books.cash - 2 * cushion) / 2;
    const wageRoom = C.wageCap.cap * 0.97 - playerPayroll(career, career.userTeamId);
    if (budget < 100_000 || wageRoom < C.transfers.minWage) return;
    const best = upgrades(career, budget, wageRoom, 3).sort((a, b) => b.gain / (b.fee + 1e5) - a.gain / (a.fee + 1e5))[0];
    if (!best) return;
    makeRoom(career);
    if (!bidForPlayer(career, best.p.id, best.fee, best.p.age < 27 ? 4 : 2).ok) return;
  }
}

function recklessWeek(career: Career, windowWeek: boolean): void {
  // Only when the lenders are already writing does the owner dip into their own pocket.
  if (inBreach(career) && career.ladder.level >= 1) topUp(career, 250_000);
  if (!windowWeek || !transferWindowOpen(career)) return;
  for (const o of borrowOptions(career)) if (o.available && o.max >= C.lenders.minLoan) borrow(career, o.lender.id, o.max);
  for (let k = 0; k < 4; k++) {
    const budget = userBooks(career).cash;
    const best = upgrades(career, budget, Infinity, 1).sort((a, b) => b.p.overall - a.p.overall)[0];
    if (!best) return;
    makeRoom(career);
    if (!bidForPlayer(career, best.p.id, best.fee, 5).ok) return;
  }
}

/** The builder's pre-season: the academy first, then one or two ground projects, all from spare club cash. */
function build(career: Career): void {
  const spare = () => userBooks(career).cash - 2 * buffer(career);
  const academy = academyUpgradeCost(career);
  if (academy !== null && spare() >= academy * 2) upgradeAcademy(career);
  const full = averageHomeCrowd(career, career.userTeamId) >= 0.9;
  for (let k = 0; k < 2; k++) {
    const options = stadiumOptions(career).filter((o) => o.available && o.kind !== 'refurbish' && o.cost <= spare());
    const seats = options.filter((o) => o.seatsAdded > 0).sort((a, b) => a.cost / a.seatsAdded - b.cost / b.seatsAdded)[0];
    const other = options.filter((o) => o.seatsAdded <= 0).sort((a, b) => a.cost - b.cost)[0];
    const pick = (full ? seats : other) ?? null;
    if (!pick || !orderProject(career, pick.key).ok) return;
  }
}

function summer(career: Career, style: OwnerStyle): void {
  if (style === 'idle') return;
  const squad = squadOf(career, career.userTeamId).sort((a, b) => b.overall - a.overall);
  const keep = style === 'reckless' ? squad : squad.slice(0, 22);
  for (const p of keep) {
    if (!renewalTerms(career, p).open) continue;
    if (style !== 'reckless' && (p.age >= 33 || playerPayroll(career, career.userTeamId) > C.wageCap.cap)) continue;
    renewContract(career, p.id, style === 'reckless' ? 4 : p.age < 28 ? 3 : 1);
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export interface CareerOptions {
  tier: TierId;
  club: string;
  style: OwnerStyle;
  seed: number;
  seasons: number;
  /** The spatial engine (coarse, as the game plays background matches) or the quick Stage 1 one. */
  engine?: SpatialMode | 'stage1';
  /** Called after every week, for tracing a run. */
  onWeek?: (career: Career) => void;
}

export function playCareer(o: CareerOptions): CareerRun {
  const t0 = performance.now();
  const engine = o.engine ?? 'coarse';
  setBackgroundEngine((setup, ctx) => {
    const r = engine === 'stage1' ? simulateMatch(setup, ctx) : simulateSpatialMatch(setup, ctx, engine);
    delete r.replay;
    return r;
  });
  const career = createCareer({ seed: o.seed, teamId: o.club, tier: o.tier, homegrownRule: false });
  // Matches are watched by nobody: the head coach runs them.
  career.delegation.matchMode = 'coach';
  const seasons: SeasonLine[] = [];
  let lost: number | null = null;
  let youth = { n: 0, overall: 0, potential: 0 };
  const seen = new Set<string>();
  const events: Record<string, number> = {};
  for (let s = 1; s <= o.seasons && lost === null; s++) {
    const ranks = strengthRanks(career);
    let maxLadder = 0;
    let lastWindow = -1;
    for (let i = 0; i < 60 && (career.phase === 'preseason' || career.phase === 'season'); i++) {
      // The owner acts once at the start of each window, plus every week for money and bids.
      const key = career.phase === 'preseason' ? 0 : C.calendar.midSeasonWindow.includes(career.season.week) ? 1 : -1;
      const windowWeek = key >= 0 && key !== lastWindow;
      if (windowWeek) lastWindow = key;
      if (o.style === 'builder' && windowWeek && career.phase === 'preseason') build(career);
      if (o.style === 'careful' || o.style === 'builder') carefulWeek(career, windowWeek);
      else if (o.style === 'reckless') recklessWeek(career, windowWeek);
      advanceCareer(career);
      o.onWeek?.(career);
      for (const ev of career.story.events) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        events[ev.eventId] = (events[ev.eventId] ?? 0) + 1;
      }
      maxLadder = Math.max(maxLadder, career.ladder.level);
    }
    const state = career.season;
    const books = userBooks(career);
    const totals = ledgerTotals(books.ledger);
    const pos = state.standings.findIndex((r) => r.teamId === career.userTeamId) + 1;
    const allPlayers = Object.values(state.league.players).filter((p) => p.teamId);
    const team = state.league.teams.find((t) => t.id === career.userTeamId)!;
    seasons.push({
      season: s,
      position: pos,
      points: state.standings[pos - 1]?.points ?? 0,
      shield: state.shieldWinnerId === career.userTeamId,
      title: state.championId === career.userTeamId,
      strengthRank: ranks.get(career.userTeamId) ?? 0,
      shieldWinnerRank: state.shieldWinnerId ? (ranks.get(state.shieldWinnerId) ?? 0) : 0,
      championRank: state.championId ? (ranks.get(state.championId) ?? 0) : 0,
      cash: Math.round(books.cash),
      debt: Math.round(totalDebt(books)),
      fortune: Math.round(career.owner.fortune),
      injected: Math.round(career.owner.injected),
      maxLadder: career.phase === 'gameOver' ? 5 : maxLadder,
      payroll: Math.round(playerPayroll(career, career.userTeamId)),
      income: Math.round(totals.income),
      spending: Math.round(totals.spending),
      incomeBy: roundAll(books.ledger.income),
      spendingBy: roundAll(books.ledger.spending),
      feesPaid: Math.round(books.ledger.spending.transfers ?? 0),
      feesReceived: Math.round(books.ledger.income.playerSales ?? 0),
      bestElevenAvg: round1(bestEleven(squadOf(career, career.userTeamId))),
      leagueElevenAvg: round1(state.league.teams.reduce((a, t) => a + bestEleven(squadOf(career, t.id)), 0) / state.league.teams.length),
      leagueAge: round1(allPlayers.reduce((a, p) => a + p.age, 0) / allPlayers.length),
      youth,
      attendance: round3(averageHomeCrowd(career, career.userTeamId)),
      fanMood: round3(team.fanMood),
    });
    // Every season's end, and the new season's start, must pass the save-code check (Stage 7.8).
    const problem = careerProblem(career);
    if (problem) throw new Error(`season ${s} end fails the save check: ${problem}`);
    if (career.phase === 'gameOver') {
      lost = s;
      break;
    }
    if (s === o.seasons) break;
    summer(career, o.style);
    const before = new Set(squadOf(career, career.userTeamId).map((p) => p.id));
    continueToNextSeason(career);
    const fresh = careerProblem(career);
    if (fresh) throw new Error(`season ${s + 1} start fails the save check: ${fresh}`);
    const intake = squadOf(career, career.userTeamId).filter((p) => !before.has(p.id) && p.age <= C.youth.age.max);
    youth = {
      n: intake.length,
      overall: round1(intake.reduce((a, p) => a + p.overall, 0) / Math.max(1, intake.length)),
      potential: round1(intake.reduce((a, p) => a + p.potential, 0) / Math.max(1, intake.length)),
    };
  }
  setBackgroundEngine(null);
  return { tier: o.tier, club: o.club, style: o.style, seed: o.seed, lost, seasons, events, ms: Math.round(performance.now() - t0) };
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
const round3 = (x: number): number => Math.round(x * 1000) / 1000;
function roundAll(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)]));
}
