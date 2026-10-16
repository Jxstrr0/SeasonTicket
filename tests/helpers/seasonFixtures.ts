/**
 * A self-contained 16-club league and stub match hooks for the season tests.
 * Nothing here touches the real player generator or match engine, so the
 * season module can be tested before clubs.json, world.json and names.json
 * are filled in. Everything is seeded; nothing uses Math.random.
 */
import { Rng, hashString } from '../../src/sim/rng';
import type { MatchContext } from '../../src/sim/match/state';
import type { SeasonHooks } from '../../src/sim/season';
import type {
  Attributes,
  AttributeKey,
  League,
  MatchResult,
  MatchSetup,
  Player,
  PlayerMatchStats,
  Position,
  StaffMember,
  Team,
  TeamMatchStats,
  TeamSelection,
} from '../../src/sim/types';

export const FIXTURE_TEAM_COUNT = 16;

/** Eleven starters in 4-3-3 order (keeper first), then a bench of seven. */
const SQUAD_SHAPE: Position[] = ['GK', 'FB', 'CB', 'CB', 'FB', 'DM', 'CM', 'CM', 'W', 'ST', 'W', 'GK', 'CB', 'FB', 'CM', 'AM', 'W', 'ST'];
const STARTERS = 11;

const ATTRIBUTE_KEYS: AttributeKey[] = ['pac', 'sta', 'str', 'dri', 'pas', 'vis', 'fin', 'hea', 'crs', 'spk', 'tck', 'mrk', 'pos', 'cmp', 'wrk', 'agg', 'ref', 'han', 'kck', 'gkp', 'dur'];
const FIRST = ['Arlen', 'Brice', 'Cormac', 'Dace', 'Evander', 'Fitz', 'Galen', 'Hollis', 'Iver', 'Jarrow'];
const LAST = ['Ashby', 'Brackwell', 'Coldridge', 'Dunhallow', 'Elmscott', 'Fernleigh', 'Glenmorrow', 'Hartwell', 'Islay', 'Juniperfield'];

/** Stub-simulator knobs, chosen so league numbers look like real soccer. */
export const STUB = {
  baseGoals: 1.25,
  homeAdvantage: 0.2,
  qualityWeight: 1.6,
  extraTimeGoals: 0.25,
  injuryChance: 0.12,
  sentOffChance: 0.06,
  maxBookingsPerSide: 3,
  bookingChance: 0.35,
};

export function teamIdAt(index: number): string {
  return `t${String(index + 1).padStart(2, '0')}`;
}

/** Squad quality spread evenly from 0.3 (t01) to 0.85 (t16). */
export function fixtureQuality(index: number): number {
  return 0.3 + (0.55 * index) / (FIXTURE_TEAM_COUNT - 1);
}

export function makeFixtureLeague(seed: number | string): League {
  const numericSeed = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const rng = new Rng(numericSeed);
  const players: Record<string, Player> = {};
  const staff: Record<string, StaffMember> = {};
  const teams: Team[] = [];
  for (let i = 0; i < FIXTURE_TEAM_COUNT; i++) {
    const id = teamIdAt(i);
    const quality = fixtureQuality(i);
    const squad = SQUAD_SHAPE.map((position, n) => makePlayer(rng, id, n, position, quality));
    for (const p of squad) players[p.id] = p;
    const coach = makeCoach(id, quality);
    staff[coach.id] = coach;
    teams.push(makeTeam(id, i, quality, squad, coach));
  }
  return { seed: numericSeed, season: 1, teams, players, staff, freeAgentIds: [], nextId: 1 };
}

function makePlayer(rng: Rng, teamId: string, n: number, position: Position, quality: number): Player {
  const overall = Math.round(40 + quality * 45 + rng.normal(0, 3));
  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) attributes[key] = Math.max(1, Math.min(99, Math.round(overall + rng.normal(0, 5))));
  return {
    id: `${teamId}-p${String(n + 1).padStart(2, '0')}`,
    firstName: FIRST[n % FIRST.length],
    lastName: LAST[(n * 3 + teamId.length) % LAST.length],
    position,
    secondaryPositions: [],
    age: 20 + (n % 13),
    nationality: n % 3 === 2 ? 'esperia' : 'valmere',
    attributes,
    overall,
    potential: Math.min(99, overall + 5),
    contract: { wage: 100000 + overall * 5000, years: 2 },
    teamId,
    injuryWeeks: 0,
    suspensionMatches: 0,
    seasonYellows: 0,
    condition: 1,
    form: [],
    jersey: n + 1,
    value: overall * 40000,
  };
}

function makeCoach(teamId: string, quality: number): StaffMember {
  return {
    id: `${teamId}-hc`,
    firstName: 'Corin',
    lastName: 'Ashdown',
    role: 'headCoach',
    nationality: 'valmere',
    rating: Math.round(40 + quality * 45),
    age: 50,
    contract: { wage: 300000, years: 2 },
    teamId,
    attackLean: 0.5,
    aggression: 0.5,
    preferredFormation: '4-3-3',
  };
}

function makeTeam(id: string, index: number, quality: number, squad: Player[], coach: StaffMember): Team {
  return {
    id,
    name: `Fixture Club ${index + 1}`,
    shortName: `Club ${index + 1}`,
    nickname: 'the Testers',
    city: `Testford ${index + 1}`,
    region: 'Lakelands',
    abbr: `T${String(index + 1).padStart(2, '0')}`,
    colors: { primary: '#336699', secondary: '#ffffff' },
    stadiumName: `Fixture Park ${index + 1}`,
    stadiumCapacity: 15000 + index * 1000,
    marketSize: 0.3 + 0.04 * index,
    stadiumCondition: 0.6,
    finances: 0.5,
    fanMood: 0.4 + 0.03 * index,
    squadQuality: quality,
    staffQuality: quality,
    playerIds: squad.map((p) => p.id),
    staffIds: [coach.id],
    selection: fixtureSelection(squad),
  };
}

function fixtureSelection(squad: Player[]): TeamSelection {
  return {
    lineup: { starters: squad.slice(0, STARTERS).map((p) => p.id), bench: squad.slice(STARTERS).map((p) => p.id) },
    tactics: {
      formationId: '4-3-3',
      mentality: 3,
      pressing: 3,
      defensiveLine: 3,
      width: 3,
      tempo: 3,
      directness: 3,
      counterAttack: false,
      timeWasting: 1,
      setPieceTakers: { penalties: null, freeKicks: null, corners: null },
      manMarkTarget: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Stub hooks
// ---------------------------------------------------------------------------

function poisson(rng: Rng, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = rng.next();
  while (p > limit) {
    k += 1;
    p *= rng.next();
  }
  return k;
}

/** Scores biased by squad quality and home advantage; playoff ties go to extra time, then a shootout. */
export function stubSimulate(setup: MatchSetup, ctx: MatchContext): MatchResult {
  const rng = new Rng(setup.seed);
  const home = ctx.teams[setup.homeId];
  const away = ctx.teams[setup.awayId];
  const gap = home.squadQuality - away.squadQuality;
  const homeLambda = STUB.baseGoals * (1 + STUB.homeAdvantage) * Math.exp(STUB.qualityWeight * gap);
  const awayLambda = STUB.baseGoals * Math.exp(-STUB.qualityWeight * gap);
  const firstHalf = { home: poisson(rng, homeLambda / 2), away: poisson(rng, awayLambda / 2) };
  let homeScore = firstHalf.home + poisson(rng, homeLambda / 2);
  let awayScore = firstHalf.away + poisson(rng, awayLambda / 2);
  let extraTime = false;
  let shootout: MatchResult['shootout'] = null;
  if (setup.playoff && homeScore === awayScore) {
    extraTime = true;
    homeScore += poisson(rng, STUB.extraTimeGoals);
    awayScore += poisson(rng, STUB.extraTimeGoals);
    if (homeScore === awayScore) {
      const homeWins = rng.chance(0.5);
      const loser = rng.int(2, 4);
      shootout = homeWins ? { home: loser + 1, away: loser } : { home: loser, away: loser + 1 };
    }
  }
  const winnerId = decideWinner(setup, homeScore, awayScore, shootout);
  const minutes = extraTime ? 120 : 90;
  const homeStarters = setup.home.lineup.starters;
  const awayStarters = setup.away.lineup.starters;
  const playerStats: Record<string, PlayerMatchStats> = {};
  for (const id of [...homeStarters, ...awayStarters]) playerStats[id] = emptyPlayerStats(id, minutes, Math.round(rng.float(5, 9) * 10) / 10);
  creditGoals(rng, homeStarters, homeScore, playerStats);
  creditGoals(rng, awayStarters, awayScore, playerStats);
  const booked = [...drawBookings(rng, homeStarters), ...drawBookings(rng, awayStarters)];
  const sentOff = [...drawSendingOff(rng, homeStarters, booked), ...drawSendingOff(rng, awayStarters, booked)];
  const injuries = drawInjuries(rng, [...homeStarters, ...awayStarters]);
  return {
    matchId: setup.matchId,
    seed: setup.seed,
    homeId: setup.homeId,
    awayId: setup.awayId,
    homeScore,
    awayScore,
    halfTimeScore: firstHalf,
    extraTime,
    shootout,
    winnerId,
    stats: { home: teamStats(rng, homeScore, 0.5), away: teamStats(rng, awayScore, 0.5) },
    playerStats,
    events: [],
    injuries,
    sentOff,
    booked,
    attendanceShare: setup.attendanceShare,
    weather: setup.weather,
  };
}

/** Returns the club's stored selection, as the tests set it. */
export function stubSelect(_rng: Rng, team: Team): TeamSelection {
  return team.selection;
}

export function stubHooks(overrides: Partial<SeasonHooks> = {}): SeasonHooks {
  return { simulate: stubSimulate, select: stubSelect, ...overrides };
}

function decideWinner(setup: MatchSetup, home: number, away: number, shootout: MatchResult['shootout']): string | null {
  if (home > away) return setup.homeId;
  if (away > home) return setup.awayId;
  if (shootout) return shootout.home > shootout.away ? setup.homeId : setup.awayId;
  return null;
}

function emptyPlayerStats(playerId: string, minutes: number, rating: number): PlayerMatchStats {
  return {
    playerId,
    minutes,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    passes: 30,
    keyPasses: 0,
    tackles: 1,
    saves: 0,
    fouls: 1,
    yellowCards: 0,
    redCards: 0,
    rating,
  };
}

/** Goals go to outfield starters (index 0 is the keeper), with an assist from a team-mate most of the time. */
function creditGoals(rng: Rng, starters: string[], goals: number, stats: Record<string, PlayerMatchStats>): void {
  const outfield = starters.slice(1);
  for (let g = 0; g < goals; g++) {
    const scorer = rng.weighted(outfield, (id) => outfield.indexOf(id) + 1);
    stats[scorer].goals += 1;
    stats[scorer].shots += 1;
    stats[scorer].shotsOnTarget += 1;
    if (rng.chance(0.75)) {
      const assister = rng.pick(outfield.filter((id) => id !== scorer));
      stats[assister].assists += 1;
    }
  }
}

function drawBookings(rng: Rng, starters: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < STUB.maxBookingsPerSide; i++) {
    if (!rng.chance(STUB.bookingChance)) continue;
    const id = rng.pick(starters);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function drawSendingOff(rng: Rng, starters: string[], booked: string[]): string[] {
  if (!rng.chance(STUB.sentOffChance)) return [];
  const pool = starters.filter((id) => !booked.includes(id));
  return pool.length ? [rng.pick(pool)] : [];
}

function drawInjuries(rng: Rng, starters: string[]): { playerId: string; weeks: number }[] {
  if (!rng.chance(STUB.injuryChance)) return [];
  return [{ playerId: rng.pick(starters), weeks: rng.int(1, 4) }];
}

function teamStats(rng: Rng, goals: number, possession: number): TeamMatchStats {
  const shotsOnTarget = goals + rng.int(1, 5);
  return {
    goals,
    shots: shotsOnTarget + rng.int(3, 8),
    shotsOnTarget,
    xg: Math.round((goals * 0.8 + rng.float(0.3, 1.2)) * 100) / 100,
    possession,
    passes: rng.int(300, 550),
    passAccuracy: rng.float(0.7, 0.88),
    corners: rng.int(2, 9),
    fouls: rng.int(7, 16),
    yellowCards: 0,
    redCards: 0,
    offsides: rng.int(0, 4),
    saves: rng.int(1, 5),
    tackles: rng.int(10, 22),
  };
}

// ---------------------------------------------------------------------------
// Hand-built results for standings tests
// ---------------------------------------------------------------------------

/** A minimal, consistent result with a given score. */
export function resultFor(matchId: string, homeId: string, awayId: string, homeScore: number, awayScore: number, extra: Partial<MatchResult> = {}): MatchResult {
  const rng = new Rng(hashString(matchId));
  return {
    matchId,
    seed: hashString(matchId),
    homeId,
    awayId,
    homeScore,
    awayScore,
    halfTimeScore: { home: 0, away: 0 },
    extraTime: false,
    shootout: null,
    winnerId: homeScore > awayScore ? homeId : awayScore > homeScore ? awayId : null,
    stats: { home: teamStats(rng, homeScore, 0.5), away: teamStats(rng, awayScore, 0.5) },
    playerStats: {},
    events: [],
    injuries: [],
    sentOff: [],
    booked: [],
    attendanceShare: 0.7,
    weather: 'clear',
    ...extra,
  };
}

/** Spearman rank correlation (average ranks for ties). */
export function spearman(xs: number[], ys: number[]): number {
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = xs.length;
  const mean = (n + 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mean) * (ry[i] - mean);
    dx += (rx[i] - mean) ** 2;
    dy += (ry[i] - mean) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k].i] = rank;
    i = j + 1;
  }
  return out;
}
