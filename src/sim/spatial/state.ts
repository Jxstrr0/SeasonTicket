/**
 * Mutable state of one spatial match. Players live in flat typed arrays indexed by
 * i = side * 11 + slot, which keeps the hot loops fast and makes the fingerprint easy.
 */
import type { Formation, Tactics } from '../types';
import type { Rng } from '../rng';
import type { LoftTable } from './ball';
import {
  PERIOD, personOf, type GoalRecord, type PeriodRecord, type ShootoutState, type ShotRecord, type Side, type SpatialAction, type SpatialEvent,
  type SpatialMode, type SpatialSetup,
} from './types';

export const N = 22;
export const LENGTH = 105;
export const WIDTH = 68;

/** Anchor values per team per step, read back by each player after his reaction delay. */
export const A_OUT_LINE = 0;
export const A_OUT_LEN = 1;
export const A_OUT_CENTRE = 2;
export const A_OUT_WIDTH = 3;
export const A_IN_LINE = 4;
export const A_IN_LEN = 5;
export const A_IN_CENTRE = 6;
export const A_IN_WIDTH = 7;
export const A_OFF_CAP = 8;
export const A_BEHIND_CAP = 9;
export const A_PRESS_ADV = 10;
export const A_BLEND = 11;
/** Out-of-possession block length for midfielders, squeezed so they stay goal-side of the ball. */
export const A_OUT_MID_LEN = 12;
export const ANCHORS = 13;
export const RING = 16;

export const BALL_HELD = 0;
export const BALL_ROLL = 1;
export const BALL_AIR = 2;
export const BALL_FROZEN = 3;
/** Out of play: waiting for a restart (SpatialMatch.restart*). */
export const BALL_DEAD = 4;

/** Restart kinds. */
export const RESTART_NONE = 0;
export const RESTART_KICKOFF = 1;
export const RESTART_GOAL_KICK = 2;
export const RESTART_CORNER = 3;
export const RESTART_THROW_IN = 4;
export const RESTART_FREE_KICK = 5;
export const RESTART_PENALTY = 6;
/** After an injury stops play, the side that had the ball restarts unopposed. */
export const RESTART_DROP = 7;

/** OnBallState.setPiece: the restart the carrier is taking, until he plays the ball. */
export const SP_NONE = 0;
export const SP_THROW = 1;
export const SP_CORNER = 2;
export const SP_GOAL_KICK = 3;
/** A free kick that may be shot at goal. */
export const SP_DIRECT = 4;
/** An indirect free kick (offside) or a dropped ball: no shot. */
export const SP_INDIRECT = 5;
export const SP_PENALTY = 6;

/** What kind of shot is in flight (RulesState.shotKind and shoot()). */
export const SHOT_KIND_OPEN = 0;
export const SHOT_KIND_HEADER = 1;
export const SHOT_KIND_FREE_KICK = 2;
export const SHOT_KIND_PENALTY = 3;

/** OnBallState.passKind values. */
export const KICK_NONE = 0;
export const KICK_PASS = 1;
export const KICK_CLEAR = 2;
export const KICK_SHOT = 3;
/** Values per planned shot sample: x, y, z, vx, vy, vz, ball state. */
export const SHOT_VALUES = 7;

/** Attribute cache layout: ATTRS values per player in OnBallState.attr (filled by initOnBall). */
export const A_PAS = 0, A_VIS = 1, A_CMP = 2, A_POS = 3, A_DRI = 4, A_STR = 5, A_TCK = 6, A_HEA = 7, A_KCK = 8, A_PAC = 9;
export const A_AGG = 10, A_FIN = 11, A_CRS = 12, A_REF = 13, A_HAN = 14, A_GKP = 15, A_WRK = 16;
export const A_SPK = 17, A_DUR = 18, A_STA = 19;
export const ATTRS = 20;

/** Per-person match stats (SpatialMatch.pstat), PSTATS values per person code. */
export const PS_SECS = 0, PS_PASSES = 1, PS_COMPLETED = 2, PS_KEY = 3, PS_TACKLES = 4, PS_SAVES = 5, PS_DIST = 6, PS_SPRINT = 7;
export const PS_FOULS = 8, PS_INTERCEPT = 9;
export const PSTATS = 10;

/** A substitution waiting for the ball to go dead: person codes. */
export interface QueuedSub {
  side: Side;
  out: number;
  in: number;
}

export interface TeamState {
  side: Side;
  tactics: Tactics;
  formation: Formation;
  /** Slot spots in the team's frame: u 0 = back line .. 1 = front, v 0 = left .. 1 = right. */
  defU: Float64Array;
  defV: Float64Array;
  attU: Float64Array;
  attV: Float64Array;
  /** 1 for the outfield slots that stay behind the ball in possession (rest defence). */
  isBehind: Uint8Array;
  /** Slots that make forward runs when we win the ball and counter-attacks are on. */
  counterSlots: number[];
  /** Our slot that man-marks, and the global index of the opponent he follows (-1 if none). */
  markerSlot: number;
  markTarget: number;
  /** Ring buffer of anchors, RING entries of ANCHORS values. */
  ring: Float64Array;
  /** Possession blend: 0 = out-of-possession shape, 1 = in-possession shape. */
  w: number;
  pressCarrier: number;
  pressEngaged: boolean;
  pressStartMs: number;
  pressRestUntil: number;
  counterPressUntil: number;
  /** Global indices of the players pressing the ball. */
  pressSet: number[];
  coverIdx: number;
  pressAdv: number;
  counterUntil: number;
  /** Per slot: the opponent this defender is tracking through his zone (-1 if none). */
  track: Int32Array;
  /** Per slot: the formation slot whose spots he takes (a red card moves players up). */
  spot: Int8Array;
  /** The keeper is coming out to narrow the angle on a carrier through on goal. */
  rush: boolean;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: number;
  /** Global index of the player holding the ball, or -1. */
  owner: number;
  /** Global index of the player the ball is meant for, or -1. */
  receiver: number;
  meetX: number;
  meetY: number;
  strikeMs: number;
  arriveMs: number;
  /** Offset of the ball from its carrier. */
  ox: number;
  oy: number;
}

/** On-ball decisions, loose balls and match stats (onball.ts). */
export interface OnBallState {
  /** Where the carrier is heading with the ball. */
  carryX: number;
  carryY: number;
  /** Next on-ball decision; the carrier may not release before readyAt (first touch). */
  decideAt: number;
  readyAt: number;
  /** After this time, holding on costs the carrier (tempo). */
  holdUntil: number;
  pressured: boolean;
  /** A team-mate coming short for a set-piece taker who has nobody to play it to, or -1. */
  show: number;
  /** The ball in flight: who kicked it, for which side, what kind (KICK_*), and whether a pass is a cross. */
  lastPasser: number;
  passSide: number;
  passKind: number;
  passCross: boolean;
  /** Intended receiver of the pass in flight, and where it was aimed. */
  passTarget: number;
  aimX: number;
  aimY: number;
  /** When the pass in flight reaches its aim point. */
  passArriveMs: number;
  /** Last player to touch a loose ball, and when; he may not touch it again straight away. */
  lastTouch: number;
  touchAt: number;
  /** Per player: may not touch a loose ball again before this time (after a miscontrol, a poke or a tackle). */
  touchBlock: Float64Array;
  /** Each side's chaser for a loose ball (-1 if none), where he is running, and when to re-pick. */
  chase: Int32Array;
  chaseX: Float64Array;
  chaseY: Float64Array;
  chaseAt: number;
  /** Per player: earliest next tackle attempt, last scan and next scan time, scan interval, and
   * facing (his last velocity above facingMinSpeed, not normalised). */
  tackleReady: Float64Array;
  scanAt: Float64Array;
  nextScan: Float64Array;
  scanMs: Float64Array;
  faceX: Float64Array;
  faceY: Float64Array;
  /** Per player attribute cache, ATTRS values each (layout above). */
  attr: Float64Array;
  /** Match stats per side. */
  possMs: Float64Array;
  passes: Int32Array;
  completed: Int32Array;
  intercepted: Int32Array;
  tackles: Int32Array;
  /** Possessions that reached the opponent's box, and whether the current one has. */
  boxEntries: Int32Array;
  entered: boolean;
  shots: Int32Array;
  onTarget: Int32Array;
  blocked: Int32Array;
  woodwork: Int32Array;
  shotsInBox: Int32Array;
  xg: Float64Array;
  /** Corners won, goal kicks taken and throw-ins won. */
  corners: Int32Array;
  goalKicks: Int32Array;
  throwIns: Int32Array;
  /** Crosses struck (blocked ones included). */
  crosses: Int32Array;
  /** The restart the carrier is taking (SP_*) until he plays the ball: it limits his options,
   * and nobody may tackle him first. */
  setPiece: number;
  /** The keeper has the ball in his hands (nobody may tackle him). */
  inHands: boolean;
  /** Last player to touch the ball in any way (decides restarts and own goals). */
  lastKick: number;
  /** The last completed pass: who received it and who played it (for assists). */
  lastRecv: number;
  lastRecvFrom: number;
  /** The shot that is in flight or was deflected, until somebody else plays the ball. */
  shooter: number;
  shotXg: number;
  shotHeader: boolean;
  shotAssist: number;
  /** The planned flight of the shot in flight: samples 1..shotN (SHOT_VALUES each), one per
   * ball substep after the strike, how many have been played, and the planned contact. */
  shotPath: Float64Array;
  shotN: number;
  shotK: number;
  /** Sample at which the shot is blocked or saved (0 if neither), how far along the move into
   * that sample the touch is (0..1), by whom, and how (1 block, 2 save). */
  shotEventK: number;
  shotEventU: number;
  shotEventKind: number;
  shotEventPlayer: number;
}

/** Off-the-ball attacking jobs (attack.ts): runs in behind and filling the box. */
export interface AttackState {
  /** Per player: run in behind until this time, where to, and no new run before runNext. */
  runUntil: Float64Array;
  runNext: Float64Array;
  runX: Float64Array;
  runY: Float64Array;
  /** Per player: the box zone he is filling (-1 if none). */
  boxSlot: Int8Array;
  /** Per side: box filling is on, and which side of the goal the ball is (-1 left, +1 right, team frame). */
  boxOn: Uint8Array;
  boxSign: Float64Array;
  /** Per side: the box is being filled for a corner (corner zones, best headers). */
  boxCorner: Uint8Array;
}

/** Laws of the game (rules.ts): offside, fouls, advantage, cards, injuries and their stats. */
export interface RulesState {
  /** Per player: yellow cards (0..1) and whether he is carrying a knock. */
  yellow: Uint8Array;
  hurt: Uint8Array;
  /** Per player: in an offside position when a team-mate last played the ball, and for which side (-1 none). */
  offFlag: Uint8Array;
  offSide: number;
  /** Advantage being played: until when, for which side (-1 none), and where the free kick would be. */
  advUntil: number;
  advSide: number;
  advX: number;
  advY: number;
  /** The free kick or penalty waiting: whether it is indirect, and its wall (defenders and spots). */
  indirect: boolean;
  nWall: number;
  wall: Int32Array;
  wallX: Float64Array;
  wallY: Float64Array;
  /** The kind of shot in flight (SHOT_KIND_*), for penalty and free-kick goals. */
  shotKind: number;
  /** Stats per side. */
  fouls: Int32Array;
  offsides: Int32Array;
  yellows: Int32Array;
  reds: Int32Array;
  penalties: Int32Array;
  penGoals: Int32Array;
  freeKicks: Int32Array;
  fkShots: Int32Array;
  fkGoals: Int32Array;
  injuries: Int32Array;
  duels: Int32Array;
  aerials: Int32Array;
  advantages: Int32Array;
  /** Time the ball has been in play. */
  inPlayMs: number;
}

export interface SpatialMatch {
  rev: number;
  seed: string;
  mode: SpatialMode;
  setup: SpatialSetup;
  stepMs: number;
  stepS: number;
  /** Ball flight substep in seconds (the step split evenly). */
  subH: number;
  subN: number;
  steps: number;
  /** Engine time since kick-off: it runs on through every period (shown times come from periodLog). */
  clockMs: number;
  rng: Rng;
  /** The period being played (PERIOD in types.ts), when it started, the stoppage minutes shown
   * (-1 until the board goes up), the stoppage built up so far (ms), and the periods so far. */
  period: number;
  periodStart: number;
  added: number;
  stoppageMs: number;
  periodLog: PeriodRecord[];
  /** Next whole second of engine time (fatigue and minutes played are counted each second). */
  nextSecond: number;
  /** Per person code: energy (0..1), energy at the start of the period, index on the pitch
   * (-1 if not on), and whether he has played (1) or has gone off (2: subbed off or sent off). */
  energy: Float64Array;
  periodEnergy: Float64Array;
  at: Int8Array;
  used: Uint8Array;
  /** Per person code: PSTATS stats each. */
  pstat: Float64Array;
  /** Substitutions waiting for a stoppage, and substitutions used per side (queued ones count). */
  subQ: QueuedSub[];
  subsUsed: Int32Array;
  /** Per index: unfatigued attributes (ATTRS each), and dist / sprint at the last whole second. */
  baseAttr: Float64Array;
  distMark: Float64Array;
  sprintMark: Float64Array;
  /** Penalties after extra time, or null. */
  shootout: ShootoutState | null;
  loft: LoftTable;
  /** Loft table for crosses (a flatter flight). */
  crossLoft: LoftTable;
  px: Float64Array;
  py: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  tx: Float64Array;
  ty: Float64Array;
  /** Each player's shape spot this step (world coordinates). */
  sx: Float64Array;
  sy: Float64Array;
  top: Float64Array;
  acc: Float64Array;
  dist: Float64Array;
  sprint: Float64Array;
  /** How tightly each player tracks a runner, 0..1, from his marking. */
  tight: Float64Array;
  role: Uint8Array;
  nextThink: Float64Array;
  delay: Int32Array;
  /** 1 while the player is on the pitch (0 once sent off). */
  on: Uint8Array;
  /** The person at each index (person codes, types.ts: a substitute takes the index of the
   * player he replaces, and a keeper sent off swaps an outfielder into index side * 11). Logs
   * and events use these. */
  who: Int32Array;
  teams: [TeamState, TeamState];
  ball: BallState;
  /** Smoothed point the shapes follow: where the ball is, or where a pass is going. */
  focusX: number;
  focusY: number;
  poss: Side;
  possChanged: boolean;
  onball: OnBallState;
  attack: AttackState;
  rules: RulesState;
  score: Int32Array;
  shotLog: ShotRecord[];
  goalLog: GoalRecord[];
  /** Fouls, cards, offsides, penalties and injuries, in time order. */
  events: SpatialEvent[];
  /** The restart being waited for (RESTART_*), by which side, when it is taken, when the ball
   * is put on the spot (it sits in the net or out of play until then), where, and who takes it. */
  restartKind: number;
  restartSide: Side;
  restartAt: number;
  placeAt: number;
  restartX: number;
  restartY: number;
  restartTaker: number;
  /** Actions not yet applied, in time order. */
  pending: SpatialAction[];
  /** Every action, applied or not, for the replay record. */
  actions: SpatialAction[];
}

/** The id of the player at index i (through SpatialMatch.who). */
export function idOf(m: SpatialMatch, i: number): string {
  return (personOf(m.setup, m.who[i]) as { id: string }).id;
}

/** Add to the stoppage time the referee is keeping (only while a period is being played). */
export function addStoppage(m: SpatialMatch, ms: number): void {
  if (m.period < PERIOD.SHOOTOUT) m.stoppageMs += ms;
}

/** Count a per-person stat for the player at index i. */
export function pstatAdd(m: SpatialMatch, i: number, k: number, v = 1): void {
  if (m.period < PERIOD.SHOOTOUT) m.pstat[m.who[i] * PSTATS + k] += v;
}

export function sideOf(i: number): Side {
  return i < 11 ? 0 : 1;
}

/** Depth in a team's frame (metres from its own goal line). Its own inverse. */
export function depthOf(side: Side, x: number): number {
  return side === 0 ? x : LENGTH - x;
}

/** Across in a team's frame (from its left touchline looking at the opponent goal). Its own inverse. */
export function acrossOf(side: Side, y: number): number {
  return side === 0 ? y : WIDTH - y;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
