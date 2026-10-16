/**
 * Squads and match setups for the engine and coach tests. Squads come from
 * the real player generator; teams, coaches and setups are hand-rolled so
 * each test controls exactly what it needs.
 */
import { Rng } from '../../src/sim/rng';
import { pickSelection } from '../../src/sim/coach';
import { generateSquad } from '../../src/sim/players';
import type { MatchContext } from '../../src/sim/match/state';
import type { MatchSetup, Player, StaffMember, Team, TeamSelection } from '../../src/sim/types';

const FIRST_NAMES = ['Arlo', 'Benedict', 'Cassius', 'Dorian', 'Emeric', 'Felix', 'Gideon', 'Hugo', 'Idris', 'Jasper', 'Kieran', 'Lucien', 'Matthias', 'Nico', 'Oskar', 'Pascal', 'Quentin', 'Rafe', 'Silas', 'Tobias', 'Ulric', 'Victor', 'Wendell', 'Xavier', 'Yannick', 'Zeph'];
const LAST_NAMES = ['Ashcombe', 'Blackwood', 'Carrow', 'Delacroix', 'Everly', 'Fenwick', 'Garrick', 'Hollis', 'Ironside', 'Juniper', 'Kestrel', 'Lockwood', 'Marchetti', 'Northam', 'Oakes', 'Pemberton', 'Quill', 'Rivard', 'Sterling', 'Thorne', 'Underhill', 'Valcourt', 'Whitlock', 'Yarrow', 'Zane', 'Alder'];

const registry = new Map<string, { team: Team; players: Record<string, Player>; coach: StaffMember }>();

/** Builds a generated squad around a quality level (0-1) with a valid selection chosen by the AI coach. */
export function makeTeam(id: string, quality: number, seed: number): { team: Team; players: Record<string, Player> } {
  const rng = new Rng(`${id}:${seed}`);
  const base = 30 + quality * 55;
  const players: Record<string, Player> = {};
  const playerIds: string[] = [];
  for (const player of squadFor(id, quality, rng)) {
    players[player.id] = player;
    playerIds.push(player.id);
  }
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

/**
 * The squad comes from the real generator so the engine's believability bands
 * are checked against the same kind of players the league plays with. Ids stay
 * readable (`alpha-p1`) and unique per fixture team.
 */
function squadFor(teamId: string, quality: number, rng: Rng): Player[] {
  let n = 0;
  const ids = { next: () => `${teamId}-p${++n}` };
  return generateSquad(rng.child('squad'), teamId, quality, ids);
}

/** The head coach makeTeam created, for coach tests. */
export function coachOf(teamId: string): StaffMember {
  const entry = registry.get(teamId);
  if (!entry) throw new Error(`makeTeam was not called for ${teamId}`);
  return entry.coach;
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

/** A match context holding every squad made with makeTeam under these ids. */
export function contextOf(...teamIds: string[]): MatchContext {
  const ctx: MatchContext = { players: {}, teams: {} };
  for (const id of teamIds) {
    const entry = registry.get(id);
    if (!entry) throw new Error(`makeTeam was not called for ${id}`);
    ctx.teams[id] = entry.team;
    Object.assign(ctx.players, entry.players);
  }
  return ctx;
}

/** Players of both squads merged into one lookup for the match context. */
export function mergePlayers(...squads: Record<string, Player>[]): Record<string, Player> {
  return Object.assign({}, ...squads);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
