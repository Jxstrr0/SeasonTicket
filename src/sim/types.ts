/**
 * Shared sim types for Season Ticket (soccer).
 * This file is the contract between modules. No DOM or three.js here.
 */
import type { SpatialRecord } from './spatial/types';

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** GK goalkeeper, CB centre-back, FB full-back, DM defensive mid, CM central mid,
 *  AM attacking mid, W winger, ST striker. */
export type Position = 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'W' | 'ST';

export const POSITIONS: readonly Position[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];

/** Nation id from src/data/world.json. 'valmere' is the home nation (domestic players). */
export type NationId = string;

export interface Attributes {
  // Physical
  pac: number; // pace
  sta: number; // stamina
  str: number; // strength
  // Technical
  dri: number; // dribbling
  pas: number; // passing
  vis: number; // vision / creativity
  fin: number; // finishing
  hea: number; // heading
  crs: number; // crossing
  spk: number; // set pieces (free kicks, corners, penalties)
  // Defensive
  tck: number; // tackling
  mrk: number; // marking
  pos: number; // positioning (defensive and attacking)
  // Mental
  cmp: number; // composure
  wrk: number; // work rate
  agg: number; // aggression (fouls, cards, duels)
  // Goalkeeping
  ref: number; // reflexes
  han: number; // handling
  kck: number; // kicking / distribution
  gkp: number; // goalkeeper positioning
  // Other
  dur: number; // durability (injury resistance)
}

export type AttributeKey = keyof Attributes;

export interface Contract {
  /** Wage per season in Valmeran dollars. */
  wage: number;
  /** Seasons remaining including the current one. 0 = expiring / free agent. */
  years: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  /** Other positions the player can cover at a small penalty. */
  secondaryPositions: Position[];
  age: number;
  nationality: NationId;
  attributes: Attributes;
  /** 1-99 overall at the main position. Derived from attributes; recompute after changes. */
  overall: number;
  /** 1-99 ceiling the player can grow toward. */
  potential: number;
  contract: Contract;
  teamId: string | null;
  /** Weeks until fit. 0 = available. */
  injuryWeeks: number;
  /** Matches still to serve. 0 = available. */
  suspensionMatches: number;
  /** Yellow cards accumulated this season (for suspension thresholds). */
  seasonYellows: number;
  /** Physical freshness 0-1. 1 = fully rested. Drops with minutes played. */
  condition: number;
  /** Recent match ratings, newest last (max 5). */
  form: number[];
  /** Squad number 1-99. */
  jersey: number;
  /** Market value in dollars. Derived; recompute after changes. */
  value: number;
}

export type StaffRole = 'headCoach' | 'assistantCoach' | 'fitnessCoach' | 'headScout' | 'academyDirector';

export const STAFF_ROLES: readonly StaffRole[] = ['headCoach', 'assistantCoach', 'fitnessCoach', 'headScout', 'academyDirector'];

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  nationality: NationId;
  /** 1-99 quality in the role. */
  rating: number;
  age: number;
  contract: Contract;
  teamId: string | null;
  /** Head coach philosophy, 0 = defend first, 1 = attack first. */
  attackLean: number;
  /** Risk appetite, 0 = cautious, 1 = gambler. */
  aggression: number;
  /** Preferred formation id (head coaches). */
  preferredFormation: string;
}

// ---------------------------------------------------------------------------
// Tactics
// ---------------------------------------------------------------------------

export interface FormationSlot {
  /** Index 0 is always the goalkeeper. */
  index: number;
  position: Position;
  /** Pitch coordinates for the 2D/3D views: x across (0 left touchline .. 1 right), y along (0 own goal .. 1 opponent goal). */
  x: number;
  y: number;
  /** Short label for UI, e.g. "LB", "RCM", "ST". */
  label: string;
  /**
   * Spatial engine spots inside the team block, as [u, v]: u 0 = back line .. 1 = front of
   * the block, v 0 = left .. 1 = right (looking at the opponent goal). `def` is out of
   * possession, `att` in possession. The goalkeeper's spots are ignored (he has his own rule).
   */
  def?: [number, number];
  att?: [number, number];
  /** Optional movement roles the engine reads in later steps. */
  roles?: SlotRole[];
}

export type SlotRole = 'overlaps' | 'inverts' | 'dropsIn';

export interface Formation {
  id: string; // e.g. "4-3-3"
  name: string;
  slots: FormationSlot[]; // exactly 11
  /** Natural width/attack bias used by the engine. 0-1. */
  defensiveBias: number;
  /**
   * Spatial engine shapes for a side down to ten or nine (keyed by players left, keeper
   * included): the slots left empty and new spots for some of the rest.
   */
  short?: Record<string, ShortShape>;
}

export interface ShortShape {
  name: string;
  drop: number[];
  set?: Record<string, { def: [number, number]; att: [number, number] }>;
}

/** Five-step dials: 1 = lowest, 3 = balanced, 5 = highest. */
export type Dial = 1 | 2 | 3 | 4 | 5;

export interface SetPieceTakers {
  penalties: string | null;
  freeKicks: string | null;
  corners: string | null;
}

export interface Tactics {
  formationId: string;
  mentality: Dial; // 1 very defensive .. 5 very attacking
  pressing: Dial; // 1 sit off .. 5 all-out press
  defensiveLine: Dial; // 1 deep .. 5 very high
  width: Dial; // 1 narrow .. 5 very wide
  tempo: Dial; // 1 slow .. 5 frantic
  directness: Dial; // 1 short passing .. 5 long balls
  counterAttack: boolean;
  timeWasting: Dial; // 1 never .. 5 always
  setPieceTakers: SetPieceTakers;
  /** Opponent player id to man-mark, or null. */
  manMarkTarget: string | null;
}

export interface Lineup {
  /** Eleven player ids ordered by formation slot index. */
  starters: string[];
  /** Up to nine player ids on the bench. */
  bench: string[];
}

export interface TeamSelection {
  lineup: Lineup;
  tactics: Tactics;
  /** Match-day form from squad mood: every attribute but aggression moves by this share (about ±0.03). None for AI clubs. */
  form?: number;
}

// ---------------------------------------------------------------------------
// Clubs and league
// ---------------------------------------------------------------------------

export interface TeamColors {
  primary: string;
  secondary: string;
}

export interface Team {
  id: string;
  /** Formal name, e.g. "Crowncaster City FC". */
  name: string;
  /** Short name for tables, e.g. "Crowncaster City". */
  shortName: string;
  /** Nickname, e.g. "the Monarchs". */
  nickname: string;
  city: string;
  region: string;
  abbr: string; // 3 letters
  colors: TeamColors;
  stadiumName: string;
  stadiumCapacity: number;
  /** 0-1 market attributes from data; difficulty comes from these, never branding. */
  marketSize: number;
  stadiumCondition: number;
  finances: number;
  fanMood: number;
  squadQuality: number;
  staffQuality: number;
  playerIds: string[];
  staffIds: string[];
  /** The club's current selection (set by the AI head coach or the human owner). */
  selection: TeamSelection;
}

export interface League {
  seed: number;
  /** Season number starting at 1. */
  season: number;
  teams: Team[];
  players: Record<string, Player>;
  staff: Record<string, StaffMember>;
  freeAgentIds: string[];
  /** Counter for generating unique ids. */
  nextId: number;
}

// ---------------------------------------------------------------------------
// Schedule and standings
// ---------------------------------------------------------------------------

export interface ScheduledMatch {
  id: string;
  /** Calendar week, 1-based. League weeks 1-15, break 16-17, league 18-32, playoffs 33-35. */
  week: number;
  /** League round 1-30, or 0 for playoff matches. */
  round: number;
  homeId: string;
  awayId: string;
  stage: 'league' | 'quarterFinal' | 'semiFinal' | 'final';
  result?: MatchResult;
}

export interface Schedule {
  season: number;
  /** Total calendar weeks including the break and playoffs. */
  weeks: number;
  breakWeeks: number[];
  matches: ScheduledMatch[];
}

export interface StandingsRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Last five results, newest last: 'W' | 'D' | 'L'. */
  form: string[];
}

export interface PlayoffBracket {
  /** Team ids seeded 1-6 (index 0 = seed 1). */
  seeds: string[];
  quarterFinals: ScheduledMatch[];
  semiFinals: ScheduledMatch[];
  final: ScheduledMatch | null;
  championId: string | null;
}

// ---------------------------------------------------------------------------
// Match engine
// ---------------------------------------------------------------------------

export type Side = 'home' | 'away';

export type Weather = 'clear' | 'rain' | 'wind' | 'heat' | 'snow';

export interface MatchSetup {
  matchId: string;
  seed: number;
  homeId: string;
  awayId: string;
  home: TeamSelection;
  away: TeamSelection;
  /** Playoff matches go to extra time and penalties when level. */
  playoff: boolean;
  /** Attendance as a share of capacity, 0-1. Affects home advantage. */
  attendanceShare: number;
  weather: Weather;
  /** Which sides are managed by the AI head coach during the match. A human-controlled side gets no automatic decisions. */
  aiControlled: { home: boolean; away: boolean };
}

export type MatchEventType =
  | 'kickoff'
  | 'chance' // a shot or clear opportunity that did not score
  | 'goal'
  | 'ownGoal'
  | 'penaltyAwarded'
  | 'penaltyScored'
  | 'penaltySaved'
  | 'penaltyMissed'
  | 'save'
  | 'corner'
  | 'freeKick'
  | 'foul'
  | 'yellowCard'
  | 'secondYellow'
  | 'redCard'
  | 'injury'
  | 'substitution'
  | 'offside'
  | 'tacticChange'
  | 'halfTime'
  | 'fullTime'
  | 'extraTimeStart'
  | 'extraTimeHalf'
  | 'extraTimeEnd'
  | 'shootoutStart'
  | 'shootoutKick'
  | 'shootoutEnd'
  | 'commentary';

export interface MatchEvent {
  /** Match minute (1-90, 91-120 in extra time, 121 for the shootout). */
  minute: number;
  /** Stoppage-time minute offset, e.g. 90+3 => minute 90, added 3. */
  added: number;
  type: MatchEventType;
  side: Side | null;
  teamId: string | null;
  playerId: string | null;
  /** Assisting player, player subbed in, or fouled player depending on type. */
  secondaryPlayerId: string | null;
  /** Expected goals of a chance or goal. */
  xg: number | null;
  /** One line of commentary for the match feed. */
  text: string;
  homeScore: number;
  awayScore: number;
  /** Whether a highlights viewer should show this moment. */
  highlight: boolean;
}

export interface TeamMatchStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  /** Possession share 0-1. */
  possession: number;
  passes: number;
  passAccuracy: number; // 0-1
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  saves: number;
  tackles: number;
}

export interface PlayerMatchStats {
  playerId: string;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  passes: number;
  keyPasses: number;
  tackles: number;
  saves: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  /** 1.0-10.0 match rating. */
  rating: number;
}

export interface MatchResult {
  matchId: string;
  seed: number;
  homeId: string;
  awayId: string;
  /** Final score including extra time, excluding the shootout. */
  homeScore: number;
  awayScore: number;
  halfTimeScore: { home: number; away: number };
  extraTime: boolean;
  shootout: { home: number; away: number } | null;
  /** Winner id; null for a draw in league play. */
  winnerId: string | null;
  stats: { home: TeamMatchStats; away: TeamMatchStats };
  playerStats: Record<string, PlayerMatchStats>;
  events: MatchEvent[];
  injuries: { playerId: string; weeks: number }[];
  /** Player ids who received a red card (or two yellows). */
  sentOff: string[];
  /** Player ids who received exactly one yellow card. */
  booked: string[];
  attendanceShare: number;
  /** Head count on the day. Set when a career settles the match; missing from older saves and headless seasons. */
  crowd?: number;
  weather: Weather;
  /** How to replay the match in the 2D viewer; taken off once the week is settled (career.replays keeps it). */
  replay?: MatchReplay;
}

/**
 * A finished match as a recipe (docs/DESIGN.md 17.9): the engine's record (seed, setup and
 * every change, the AI's included) plus what it must be replayed under. `tuning` is the
 * tuning fingerprint and `check` the engine's fingerprint at the final whistle, so a replay
 * that comes out differently can tell.
 */
export interface MatchReplay {
  record: SpatialRecord;
  tuning: number;
  check: string;
}

/** Actions a manager (human or AI) can take during a live match. */
export type MatchAction =
  | { type: 'setTactics'; side: Side; tactics: Tactics }
  | { type: 'substitute'; side: Side; outId: string; inId: string }
  | { type: 'setMentality'; side: Side; mentality: Dial };
