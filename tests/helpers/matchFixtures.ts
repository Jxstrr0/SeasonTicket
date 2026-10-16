/**
 * Hand-rolled squads and match setups for the engine and coach tests. The
 * real player generator is a separate module, so this builds believable
 * 26-player squads on its own.
 */
import { Rng } from '../../src/sim/rng';
import { pickSelection } from '../../src/sim/coach';
import type { Attributes, AttributeKey, MatchSetup, Player, Position, StaffMember, Team, TeamSelection } from '../../src/sim/types';

const FIRST_NAMES = ['Arlo', 'Benedict', 'Cassius', 'Dorian', 'Emeric', 'Felix', 'Gideon', 'Hugo', 'Idris', 'Jasper', 'Kieran', 'Lucien', 'Matthias', 'Nico', 'Oskar', 'Pascal', 'Quentin', 'Rafe', 'Silas', 'Tobias', 'Ulric', 'Victor', 'Wendell', 'Xavier', 'Yannick', 'Zeph'];
const LAST_NAMES = ['Ashcombe', 'Blackwood', 'Carrow', 'Delacroix', 'Everly', 'Fenwick', 'Garrick', 'Hollis', 'Ironside', 'Juniper', 'Kestrel', 'Lockwood', 'Marchetti', 'Northam', 'Oakes', 'Pemberton', 'Quill', 'Rivard', 'Sterling', 'Thorne', 'Underhill', 'Valcourt', 'Whitlock', 'Yarrow', 'Zane', 'Alder'];
const FOREIGN_NATIONS = ['esperia', 'kaltland', 'marrovia', 'sundara', 'ostenburg', 'caravelle', 'tessaly', 'norrvik'];

/** Squad shape: three keepers and a sensible spread of outfield positions. */
const SQUAD_SHAPE: Position[] = [
  'GK', 'GK', 'GK',
  'CB', 'CB', 'CB', 'CB', 'CB',
  'FB', 'FB', 'FB', 'FB',
  'DM', 'DM', 'DM',
  'CM', 'CM', 'CM', 'CM',
  'AM', 'AM',
  'W', 'W', 'W',
  'ST', 'ST',
];

/** Attribute offsets from the squad's base level, per position. */
const PROFILES: Record<Position, Partial<Record<AttributeKey, number>>> = {
  GK: { ref: 15, han: 15, gkp: 15, kck: 8, pos: 5, dri: -25, fin: -25, crs: -25, tck: -25, mrk: -25, pas: -10, pac: -10, hea: -5, vis: -10, spk: -15 },
  CB: { tck: 12, mrk: 12, pos: 10, hea: 12, str: 10, dri: -8, fin: -15, crs: -10, vis: -8, pac: -3, ref: -40, han: -40, gkp: -40, kck: -30 },
  FB: { pac: 8, tck: 6, mrk: 6, crs: 8, sta: 8, wrk: 6, fin: -12, hea: -3, ref: -40, han: -40, gkp: -40, kck: -30 },
  DM: { tck: 10, mrk: 8, pos: 8, pas: 6, str: 5, wrk: 8, fin: -10, pac: -3, ref: -40, han: -40, gkp: -40, kck: -30 },
  CM: { pas: 10, vis: 8, wrk: 8, sta: 6, tck: 3, dri: 3, fin: -5, ref: -40, han: -40, gkp: -40, kck: -30 },
  AM: { vis: 12, pas: 10, dri: 10, fin: 4, cmp: 5, spk: 5, tck: -10, mrk: -10, hea: -5, ref: -40, han: -40, gkp: -40, kck: -30 },
  W: { pac: 12, dri: 12, crs: 8, fin: 3, spk: 3, tck: -10, mrk: -10, hea: -5, str: -5, ref: -40, han: -40, gkp: -40, kck: -30 },
  ST: { fin: 14, cmp: 8, pos: 6, hea: 6, str: 5, pac: 4, spk: 3, tck: -12, mrk: -12, pas: -5, ref: -40, han: -40, gkp: -40, kck: -30 },
};

const OVERALL_KEYS: Record<Position, AttributeKey[]> = {
  GK: ['ref', 'han', 'gkp', 'kck', 'pos'],
  CB: ['tck', 'mrk', 'pos', 'hea', 'str', 'pac'],
  FB: ['pac', 'tck', 'mrk', 'crs', 'sta', 'pos'],
  DM: ['tck', 'mrk', 'pos', 'pas', 'wrk', 'str'],
  CM: ['pas', 'vis', 'wrk', 'sta', 'tck', 'dri'],
  AM: ['vis', 'pas', 'dri', 'fin', 'cmp'],
  W: ['pac', 'dri', 'crs', 'fin', 'vis'],
  ST: ['fin', 'cmp', 'pos', 'hea', 'pac', 'str'],
};

const SECONDARY: Record<Position, Position[]> = {
  GK: [],
  CB: ['DM'],
  FB: ['W'],
  DM: ['CM'],
  CM: ['AM'],
  AM: ['CM'],
  W: ['AM'],
  ST: ['W'],
};

const ALL_KEYS: AttributeKey[] = ['pac', 'sta', 'str', 'dri', 'pas', 'vis', 'fin', 'hea', 'crs', 'spk', 'tck', 'mrk', 'pos', 'cmp', 'wrk', 'agg', 'ref', 'han', 'kck', 'gkp', 'dur'];

const registry = new Map<string, { team: Team; players: Record<string, Player>; coach: StaffMember }>();

/** Builds a 26-player squad around a quality level (0-1) with a valid selection chosen by the AI coach. */
export function makeTeam(id: string, quality: number, seed: number): { team: Team; players: Record<string, Player> } {
  const rng = new Rng(`${id}:${seed}`);
  const base = 30 + quality * 55;
  const players: Record<string, Player> = {};
  const playerIds: string[] = [];
  SQUAD_SHAPE.forEach((position, index) => {
    const player = makePlayer(`${id}-p${index + 1}`, id, position, base, index + 1, rng);
    players[player.id] = player;
    playerIds.push(player.id);
  });
  const coach: StaffMember = {
    id: `${id}-coach`,
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    role: 'headCoach',
    nationality: 'valmere',
    rating: Math.round(base),
    age: 48,
    contract: { wage: 500000, years: 2 },
    teamId: id,
    attackLean: 0.5,
    aggression: 0.5,
    preferredFormation: '4-3-3',
  };
  const placeholderSelection: TeamSelection = {
    lineup: { starters: [], bench: [] },
    tactics: {
      formationId: '4-3-3',
      mentality: 3, pressing: 3, defensiveLine: 3, width: 3, tempo: 3, directness: 3,
      counterAttack: false, timeWasting: 1,
      setPieceTakers: { penalties: null, freeKicks: null, corners: null },
      manMarkTarget: null,
    },
  };
  const team: Team = {
    id,
    name: `${capitalize(id)} FC`,
    shortName: capitalize(id),
    nickname: `the ${capitalize(id)}s`,
    city: capitalize(id),
    region: 'Lakelands',
    abbr: id.slice(0, 3).toUpperCase(),
    colors: { primary: '#224488', secondary: '#ffffff' },
    stadiumName: `${capitalize(id)} Park`,
    stadiumCapacity: 20000,
    marketSize: quality,
    stadiumCondition: 0.7,
    finances: 0.5,
    fanMood: 0.6,
    squadQuality: quality,
    staffQuality: quality,
    playerIds,
    staffIds: [coach.id],
    selection: placeholderSelection,
  };
  team.selection = pickSelection(rng, team, players, coach);
  registry.set(id, { team, players, coach });
  return { team, players };
}

/** The head coach makeTeam created, for coach tests. */
export function coachOf(teamId: string): StaffMember {
  const entry = registry.get(teamId);
  if (!entry) throw new Error(`makeTeam was not called for ${teamId}`);
  return entry.coach;
}

function makePlayer(id: string, teamId: string, position: Position, base: number, jersey: number, rng: Rng): Player {
  const profile = PROFILES[position];
  const attributes = {} as Attributes;
  for (const key of ALL_KEYS) {
    const offset = profile[key] ?? 0;
    attributes[key] = Math.round(rng.normalClamped(base + offset, 6, 15, 99));
  }
  attributes.agg = Math.round(rng.normalClamped(position === 'CB' || position === 'DM' || position === 'FB' ? 62 : 50, 10, 20, 95));
  attributes.dur = Math.round(rng.normalClamped(60, 10, 25, 95));
  const overall = Math.round(OVERALL_KEYS[position].reduce((sum, key) => sum + attributes[key], 0) / OVERALL_KEYS[position].length);
  const domestic = rng.chance(0.65);
  return {
    id,
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    position,
    secondaryPositions: rng.chance(0.6) ? SECONDARY[position].slice() : [],
    age: rng.int(18, 34),
    nationality: domestic ? 'valmere' : rng.pick(FOREIGN_NATIONS),
    attributes,
    overall,
    potential: Math.min(99, overall + rng.int(0, 12)),
    contract: { wage: 200000 + overall * 10000, years: rng.int(1, 4) },
    teamId,
    injuryWeeks: 0,
    suspensionMatches: 0,
    seasonYellows: 0,
    condition: rng.float(0.92, 1),
    form: [],
    jersey,
    value: overall * 50000,
  };
}

/** A league setup between two squads made with makeTeam, both AI-managed unless overridden. */
export function makeSetup(homeId: string, awayId: string, seed: number, overrides: Partial<MatchSetup> = {}): MatchSetup {
  const home = registry.get(homeId);
  const away = registry.get(awayId);
  if (!home || !away) throw new Error(`makeTeam must run for ${homeId} and ${awayId} before makeSetup`);
  return {
    matchId: `${homeId}-${awayId}-${seed}`,
    seed,
    homeId,
    awayId,
    home: cloneSelection(home.team.selection),
    away: cloneSelection(away.team.selection),
    playoff: false,
    attendanceShare: 0.8,
    weather: 'clear',
    aiControlled: { home: true, away: true },
    ...overrides,
  };
}

export function cloneSelection(selection: TeamSelection): TeamSelection {
  return {
    lineup: { starters: selection.lineup.starters.slice(), bench: selection.lineup.bench.slice() },
    tactics: { ...selection.tactics, setPieceTakers: { ...selection.tactics.setPieceTakers } },
  };
}

/** Players of both squads merged into one lookup for the match context. */
export function mergePlayers(...squads: Record<string, Player>[]): Record<string, Player> {
  return Object.assign({}, ...squads);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
