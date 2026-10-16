/**
 * The season runner: one calendar week at a time, league rounds, the
 * mid-season break and the playoffs. The headless season and the live match
 * share the same code because the simulator and the selector are injected
 * hooks (the real engine and AI head coach by default, stubs in tests).
 */
import { SEASON_TUNING } from './data';
import { pickSelection } from './coach';
import { headCoachOf, homegrownMinimumFor, teamById } from './league';
import { simulateMatch } from './match/engine';
import type { MatchContext } from './match/state';
import { advanceBracket, createBracket, scheduleFinal, scheduleQuarterFinals, scheduleSemiFinals, seedPlayoffs } from './playoffs';
import { Rng, hashString } from './rng';
import { buildSchedule, lastLeagueWeek } from './schedule';
import { computeStandings } from './standings';
import type {
  League,
  MatchResult,
  MatchSetup,
  Player,
  PlayoffBracket,
  Schedule,
  ScheduledMatch,
  StaffMember,
  StandingsRow,
  Team,
  TeamSelection,
  Weather,
} from './types';

const T = SEASON_TUNING;

export type SeasonPhase = 'regular' | 'break' | 'playoffs' | 'complete';

export interface SeasonState {
  league: League;
  schedule: Schedule;
  bracket: PlayoffBracket | null;
  /** The next week to play, starting at 1. */
  week: number;
  phase: SeasonPhase;
  standings: StandingsRow[];
  championId: string | null;
  /** Table winner after the last league round. */
  shieldWinnerId: string | null;
  /** Career setting chosen at the start; undefined falls back to season.json. */
  homegrownRule?: boolean;
}

export interface SeasonHooks {
  simulate(setup: MatchSetup, ctx: MatchContext): MatchResult;
  select(
    rng: Rng,
    team: Team,
    players: Record<string, Player>,
    headCoach: StaffMember | null,
    opts: { opponent: Team; homegrownMinimum?: number },
  ): TeamSelection;
  /** Share of capacity for a match; defaults to attendanceShare (the career adds ticket prices). */
  attendance?(rng: Rng, home: Team, away: Team, playoff: boolean): number;
  /** Whether the AI head coach runs this club during matches; defaults to every club. */
  aiControlled?(teamId: string): boolean;
}

export interface CreateSeasonOptions {
  homegrownRule?: boolean;
}

export function defaultHooks(): SeasonHooks {
  return {
    simulate: (setup, ctx) => simulateMatch(setup, ctx),
    select: (rng, team, players, headCoach, opts) => pickSelection(rng, team, players, headCoach, opts),
  };
}

/** Starts a season: fresh fixture list, empty table, yellow-card tallies reset. */
export function createSeason(league: League, rng?: Rng, opts: CreateSeasonOptions = {}): SeasonState {
  const scheduleRng = rng ?? new Rng(league.seed).child(`schedule-${league.season}`);
  const teamIds = league.teams.map((t) => t.id);
  for (const player of Object.values(league.players)) player.seasonYellows = 0;
  const state: SeasonState = {
    league,
    schedule: buildSchedule(scheduleRng, league.season, teamIds),
    bracket: null,
    week: 1,
    phase: 'regular',
    standings: computeStandings(teamIds, [], standingsRng(league)),
    championId: null,
    shieldWinnerId: null,
    homegrownRule: opts.homegrownRule,
  };
  state.phase = phaseForWeek(state, state.week);
  return state;
}

export function matchesForWeek(state: SeasonState, week: number): ScheduledMatch[] {
  return state.schedule.matches.filter((m) => m.week === week);
}

/** Same seed and match id, same setup: a match replays identically. */
export function matchSeed(leagueSeed: number, matchId: string): number {
  return hashString(`${leagueSeed}:${matchId}`);
}

export function buildMatchSetup(state: SeasonState, match: ScheduledMatch, hooks: SeasonHooks): MatchSetup {
  const league = state.league;
  const seed = matchSeed(league.seed, match.id);
  const rng = new Rng(seed);
  const home = teamById(league, match.homeId);
  const away = teamById(league, match.awayId);
  const playoff = match.stage !== 'league';
  const homegrownMinimum = homegrownMinimumFor(state.homegrownRule ?? T.homegrownRule);
  const pick = (team: Team, opponent: Team, label: string) =>
    cloneSelection(hooks.select(rng.child(label), team, league.players, headCoachOf(league, team.id), { opponent, homegrownMinimum }));
  return {
    matchId: match.id,
    seed,
    homeId: home.id,
    awayId: away.id,
    home: pick(home, away, 'home-xi'),
    away: pick(away, home, 'away-xi'),
    playoff,
    attendanceShare: (hooks.attendance ?? attendanceShare)(rng.child('attendance'), home, away, playoff),
    weather: weatherFor(rng.child('weather'), match.week),
    aiControlled: { home: hooks.aiControlled?.(home.id) ?? true, away: hooks.aiControlled?.(away.id) ?? true },
  };
}

export function applyMatchResult(state: SeasonState, match: ScheduledMatch, result: MatchResult): void {
  match.result = result;
  syncBracketResult(state.bracket, match, result);
  const players = state.league.players;
  for (const injury of result.injuries) {
    const p = players[injury.playerId];
    if (p) p.injuryWeeks = Math.max(p.injuryWeeks, injury.weeks);
  }
  for (const id of result.sentOff) {
    const p = players[id];
    if (p) p.suspensionMatches += T.discipline.redCardSuspension;
  }
  for (const id of result.booked) {
    const p = players[id];
    if (p) addYellow(p);
  }
  for (const stats of Object.values(result.playerStats)) {
    const p = players[stats.playerId];
    if (p && stats.minutes > 0) recordAppearance(p, stats.minutes, stats.rating);
  }
}

export function advanceWeek(state: SeasonState, hooks: SeasonHooks = defaultHooks()): MatchResult[] {
  if (state.phase === 'complete') return [];
  const week = state.week;
  const fixtures = matchesForWeek(state, week).filter((m) => !m.result);
  const servingBan = suspendedPlayers(state.league, fixtures);
  const alreadyInjured = injuredPlayers(state.league);
  const ctx = matchContext(state.league);

  const results = fixtures.map((match) => {
    const setup = buildMatchSetup(state, match, hooks);
    rememberSelections(state.league, setup);
    const result = hooks.simulate(setup, ctx);
    applyMatchResult(state, match, result);
    return result;
  });

  for (const p of servingBan) p.suspensionMatches = Math.max(0, p.suspensionMatches - 1);
  if (fixtures.some((m) => m.stage === 'league')) refreshStandings(state);
  endOfWeekRecovery(state.league, alreadyInjured);
  progressCalendar(state, week);
  state.week = week + 1;
  state.phase = state.championId ? 'complete' : phaseForWeek(state, state.week);
  return results;
}

export function runSeason(state: SeasonState, hooks: SeasonHooks = defaultHooks()): SeasonState {
  const limit = state.schedule.weeks + 1;
  for (let guard = 0; state.phase !== 'complete'; guard++) {
    if (guard > limit) throw new Error(`Season did not complete within ${limit} weeks`);
    advanceWeek(state, hooks);
  }
  return state;
}

export interface SeasonSummary {
  topScorers: { playerId: string; goals: number; assists: number }[];
  champion: string | null;
  shield: string | null;
  avgGoals: number;
  homeWinRate: number;
  drawRate: number;
}

/** League numbers from the stored results (playoffs are left out of the scorers and the rates). */
export function seasonSummary(state: SeasonState): SeasonSummary {
  const played = state.schedule.matches.filter((m) => m.stage === 'league' && m.result).map((m) => m.result as MatchResult);
  const n = played.length;
  const goals = played.reduce((sum, r) => sum + r.homeScore + r.awayScore, 0);
  const homeWins = played.filter((r) => r.homeScore > r.awayScore).length;
  const draws = played.filter((r) => r.homeScore === r.awayScore).length;
  return {
    topScorers: topScorers(played, T.summaryTopScorers),
    champion: state.championId,
    shield: state.shieldWinnerId,
    avgGoals: n ? goals / n : 0,
    homeWinRate: n ? homeWins / n : 0,
    drawRate: n ? draws / n : 0,
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function phaseForWeek(state: SeasonState, week: number): SeasonPhase {
  if (state.bracket) return 'playoffs';
  return state.schedule.breakWeeks.includes(week) ? 'break' : 'regular';
}

/** After the last league round: shield and playoff seeding. After each playoff round: the next round, then the champion. */
function progressCalendar(state: SeasonState, week: number): void {
  const season = state.league.season;
  const W = T.calendar.playoffWeeks;
  if (!state.bracket) {
    if (week >= lastLeagueWeek() && leagueComplete(state.schedule)) startPlayoffs(state);
    return;
  }
  const bracket = state.bracket;
  if (bracket.semiFinals.length === 0) {
    state.schedule.matches.push(...scheduleSemiFinals(bracket, season, W.semiFinal));
  } else if (!bracket.final) {
    const final = scheduleFinal(bracket, season, W.final);
    if (final) state.schedule.matches.push(final);
  } else {
    advanceBracket(bracket);
    state.championId = bracket.championId;
  }
}

function leagueComplete(schedule: Schedule): boolean {
  return schedule.matches.every((m) => m.stage !== 'league' || m.result !== undefined);
}

function startPlayoffs(state: SeasonState): void {
  state.shieldWinnerId = state.standings[0]?.teamId ?? null;
  const bracket = createBracket(seedPlayoffs(state.standings));
  state.bracket = bracket;
  state.schedule.matches.push(...scheduleQuarterFinals(bracket, state.league.season, T.calendar.playoffWeeks.quarterFinal));
}

function refreshStandings(state: SeasonState): void {
  state.standings = computeStandings(state.league.teams.map((t) => t.id), state.schedule.matches, standingsRng(state.league));
}

/** One stream per season so the coin flip never changes week to week. */
function standingsRng(league: League): Rng {
  return new Rng(league.seed).child(`standings-${league.season}`);
}

// ---------------------------------------------------------------------------
// Match day inputs
// ---------------------------------------------------------------------------

export function matchContext(league: League): MatchContext {
  const teams: Record<string, Team> = {};
  for (const t of league.teams) teams[t.id] = t;
  return { players: league.players, teams };
}

export function weatherFor(rng: Rng, week: number): Weather {
  const band = T.weather.bands.find((b) => week >= b.fromWeek && week <= b.toWeek);
  if (!band) return T.weather.fallback as Weather;
  const odds = Object.entries(band.odds).filter((e): e is [string, number] => typeof e[1] === 'number');
  return rng.weighted(odds, ([, weight]) => weight)[0] as Weather;
}

export function attendanceShare(rng: Rng, home: Team, away: Team, playoff: boolean): number {
  const a = T.attendance;
  const raw =
    a.base +
    a.fanMood * home.fanMood +
    a.marketSize * home.marketSize +
    a.stadiumCondition * home.stadiumCondition +
    a.opponentQuality * away.squadQuality +
    (playoff ? a.playoffBonus : 0) +
    rng.normal(0, a.noiseSd);
  return clamp(raw, a.min, a.max);
}

function cloneSelection(selection: TeamSelection): TeamSelection {
  return {
    lineup: { starters: selection.lineup.starters.slice(), bench: selection.lineup.bench.slice() },
    tactics: { ...selection.tactics, setPieceTakers: { ...selection.tactics.setPieceTakers } },
  };
}

/** The selection a club last fielded becomes its current one (what the UI shows). */
function rememberSelections(league: League, setup: MatchSetup): void {
  teamById(league, setup.homeId).selection = cloneSelection(setup.home);
  teamById(league, setup.awayId).selection = cloneSelection(setup.away);
}

// ---------------------------------------------------------------------------
// Player upkeep
// ---------------------------------------------------------------------------

function addYellow(player: Player): void {
  player.seasonYellows += 1;
  if (player.seasonYellows % T.discipline.yellowsPerSuspension === 0) {
    player.suspensionMatches += T.discipline.yellowSuspensionMatches;
  }
}

function recordAppearance(player: Player, minutes: number, rating: number): void {
  const c = T.condition;
  player.condition = clamp(player.condition - (c.lossPer90 * minutes) / 90, c.min, c.max);
  player.form = [...player.form, rating].slice(-T.formLength);
}

/** Players of this week's clubs who carry a ban into the week: they sit this match out and serve one match of it. */
function suspendedPlayers(league: League, fixtures: ScheduledMatch[]): Player[] {
  const playing = new Set(fixtures.flatMap((m) => [m.homeId, m.awayId]));
  return league.teams
    .filter((t) => playing.has(t.id))
    .flatMap((t) => t.playerIds.map((id) => league.players[id]))
    .filter((p): p is Player => !!p && p.suspensionMatches > 0);
}

function injuredPlayers(league: League): Set<string> {
  return new Set(Object.values(league.players).filter((p) => p.injuryWeeks > 0).map((p) => p.id));
}

function endOfWeekRecovery(league: League, injuredBeforeMatches: Set<string>): void {
  const c = T.condition;
  for (const p of Object.values(league.players)) {
    const ticks = T.injuries.tickWeekOfInjury || injuredBeforeMatches.has(p.id);
    if (p.injuryWeeks > 0 && ticks) p.injuryWeeks -= 1;
    p.condition = clamp(p.condition + (c.max - p.condition) * c.weeklyRecoveryShare, c.min, c.max);
  }
}

function topScorers(results: MatchResult[], limit: number): SeasonSummary['topScorers'] {
  const totals = new Map<string, { playerId: string; goals: number; assists: number }>();
  for (const r of results) {
    for (const s of Object.values(r.playerStats)) {
      if (s.goals === 0 && s.assists === 0) continue;
      const row = totals.get(s.playerId) ?? { playerId: s.playerId, goals: 0, assists: 0 };
      row.goals += s.goals;
      row.assists += s.assists;
      totals.set(s.playerId, row);
    }
  }
  return [...totals.values()]
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.playerId.localeCompare(b.playerId))
    .slice(0, limit);
}

function syncBracketResult(bracket: PlayoffBracket | null, match: ScheduledMatch, result: MatchResult): void {
  if (!bracket || match.stage === 'league') return;
  const copies = [...bracket.quarterFinals, ...bracket.semiFinals, ...(bracket.final ? [bracket.final] : [])];
  for (const copy of copies) if (copy.id === match.id && copy !== match) copy.result = result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
