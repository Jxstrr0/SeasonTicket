/**
 * Checks a loaded career has the shape the game reads (Stage 7.8). A save code can unpack and
 * parse yet be hand-edited or come from a damaged copy: a word where a number should be, a
 * player missing from his club, a club with no books. Any of those would crash a screen later
 * or turn the money into NaN, so the code is refused at the door instead.
 *
 * Not every field is checked: the ones money, squads, the table and the fixtures hang on are.
 */
import { C, type Career } from '../sim/career';
import { POSITIONS } from '../sim/types';

const PHASES = new Set(['preseason', 'season', 'review', 'gameOver']);

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function num(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function nums(v: unknown, keys?: readonly string[]): boolean {
  if (!isObj(v)) return false;
  return (keys ?? Object.keys(v)).every((k) => num(v[k]));
}

function strings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

const LEDGER_PARTS = ['income', 'spending', 'financing'] as const;

function ledgerOk(v: unknown): boolean {
  return isObj(v) && LEDGER_PARTS.every((k) => nums(v[k]));
}

function booksProblem(id: string, v: unknown): string | null {
  if (!isObj(v)) return `no books for ${id}`;
  if (!nums(v, ['cash', 'payrollAccum', 'payrollWeeks', 'overCapSeasons', 'academyLevel', 'ticketPrice', 'baseFanMood'])) return `books for ${id} have a bad number`;
  if (!ledgerOk(v.ledger) || (v.lastLedger !== null && !ledgerOk(v.lastLedger))) return `ledger for ${id}`;
  if (!Array.isArray(v.debts) || !v.debts.every((d) => nums(d, ['balance', 'rate', 'weeklyPayment', 'weeksLeft', 'minCash']))) return `debts for ${id}`;
  return null;
}

function playerProblem(id: string, v: unknown): string | null {
  if (!isObj(v) || v.id !== id) return `player ${id}`;
  if (typeof v.firstName !== 'string' || typeof v.lastName !== 'string') return `player ${id} name`;
  if (!POSITIONS.includes(v.position as never) || !strings(v.secondaryPositions)) return `player ${id} position`;
  if (!nums(v, ['age', 'overall', 'potential', 'injuryWeeks', 'suspensionMatches', 'seasonYellows', 'condition', 'jersey', 'value'])) return `player ${id} has a bad number`;
  if (!nums(v.attributes) || !nums(v.contract, ['wage', 'years'])) return `player ${id} attributes or contract`;
  if (!Array.isArray(v.form) || !v.form.every(num)) return `player ${id} form`;
  if (v.teamId !== null && typeof v.teamId !== 'string') return `player ${id} club`;
  return null;
}

/** The first thing wrong with the career, or null if it looks whole. */
export function careerProblem(career: Career): string | null {
  const c = career as unknown as Obj;
  if (!num(c.seed) || !num(c.weekIndex) || !num(c.preseasonWeek) || !num(c.counter)) return 'top-level numbers';
  if (typeof c.userTeamId !== 'string' || !(C.tiers.order as string[]).includes(c.tier as string) || !PHASES.has(c.phase as string)) return 'club, difficulty or phase';
  if (!nums(c.owner, ['fortune', 'injected'])) return 'owner';
  if (!nums(c.ladder, ['level', 'goodWeeks'])) return 'lender ladder';
  if (!isObj(c.crest) || !isObj(c.delegation) || !isObj(c.story) || !isObj(c.news) || !isObj(c.replays)) return 'missing part';
  for (const k of ['loansIn', 'incomingBids', 'sponsorOffers', 'staffPool', 'inbox', 'history'] as const) if (!Array.isArray(c[k])) return k;
  if (!isObj(c.counters) || !Object.values(c.counters).every(num)) return 'counters';
  if (!isObj(c.playerSeason) || !isObj(c.books) || !isObj(c.stadiums) || !isObj(c.owners)) return 'club records';

  const season = c.season;
  if (!isObj(season) || !num(season.week) || !isObj(season.schedule) || !Array.isArray(season.standings)) return 'season';
  const league = season.league;
  if (!isObj(league) || !Array.isArray(league.teams) || !isObj(league.players) || !isObj(league.staff) || !strings(league.freeAgentIds)) return 'league';
  if (!num(league.season) || !num(league.nextId)) return 'league numbers';

  const players = league.players;
  for (const [id, p] of Object.entries(players)) {
    const bad = playerProblem(id, p);
    if (bad) return bad;
  }
  const teamIds = new Set<string>();
  for (const t of league.teams as unknown[]) {
    if (!isObj(t) || typeof t.id !== 'string' || teamIds.has(t.id)) return 'club list';
    const id = t.id;
    teamIds.add(id);
    if (typeof t.name !== 'string' || typeof t.shortName !== 'string' || typeof t.abbr !== 'string' || !isObj(t.colors) || !isObj(t.selection)) return `club ${id}`;
    if (!nums(t, ['stadiumCapacity', 'marketSize', 'fanMood', 'squadQuality', 'staffQuality'])) return `club ${id} has a bad number`;
    if (!strings(t.playerIds) || !strings(t.staffIds)) return `club ${id} squad`;
    for (const pid of t.playerIds) if ((players[pid] as Obj | undefined)?.teamId !== id) return `club ${id} player ${pid}`;
    for (const sid of t.staffIds) if (!isObj(league.staff[sid])) return `club ${id} staff ${sid}`;
    const bad = booksProblem(id, (c.books as Obj)[id]);
    if (bad) return bad;
    if (!isObj((c.stadiums as Obj)[id])) return `stadium for ${id}`;
  }
  if (!teamIds.has(c.userTeamId)) return 'your club is missing';

  const matches = season.schedule.matches;
  if (!Array.isArray(matches)) return 'fixtures';
  for (const m of matches as unknown[]) {
    if (!isObj(m) || typeof m.id !== 'string' || !num(m.week) || !teamIds.has(m.homeId as string) || !teamIds.has(m.awayId as string)) return 'fixture';
  }
  return null;
}
