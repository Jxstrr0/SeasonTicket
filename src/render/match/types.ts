/**
 * What the 3D match view needs. Like the stadium snapshot, the UI builds these plain
 * objects from the engine (src/ui/career/match3d.ts); the render code never reads the
 * sim, so the ball states and index layout are local copies of the engine's.
 *
 * Players are indexed side * 11 + slot (slot 0 is the keeper), the engine's order.
 */
import type { StadiumSnapshot } from '../stadium/types';

/** The engine's ball states (src/sim/spatial/state.ts). */
export const BALL = { HELD: 0, ROLL: 1, AIR: 2, FROZEN: 3, DEAD: 4 } as const;

/**
 * What a player does with the ball, or at it (Stage 5.2). The UI reads these off the engine
 * as it plays and hands them over before they happen (the 3D view runs a little behind the
 * engine), so a leg can swing back before the ball leaves it.
 */
export const ACT = {
  /** A pass, cross, clearance, shot, goal kick or keeper's punt. */
  KICK: 1,
  /** A first touch or a poke with the foot. */
  TOUCH: 2,
  /** Heading the ball (a jump when it is high enough). */
  HEADER: 3,
  /** Taking the ball on the chest. */
  CHEST: 4,
  /** A standing tackle. */
  TACKLE: 5,
  /** A sliding tackle. */
  SLIDE: 6,
  /** A keeper going for a shot: a dive, a jump or a scoop, from where he stands. */
  DIVE: 7,
  /** Getting in the way of a shot. */
  BLOCK: 8,
  /** A throw-in, or a keeper throwing the ball out. */
  THROW: 9,
  /** Brought down by a foul. */
  FALL: 10,
  /** A goal: the scorer and his team-mates celebrate, the other side's heads drop. */
  GOAL: 11,
  /** A keeper gathering the ball without a dive. */
  CATCH: 12,
} as const;

export interface ActionCue {
  /** Rises by one per cue, so the view can tell new ones. */
  id: number;
  kind: number;
  /** Player index (side * 11 + slot). */
  player: number;
  /** Match ms of the contact: the ball leaves, arrives or goes in. */
  atMs: number;
  /** The earliest the action may start (a keeper's dive waits for the shot to be hit). */
  fromMs: number;
  /** A pitch point (metres) the action points at: where the ball goes or where it is met. */
  x: number;
  y: number;
  /** Ball height at the contact (metres). */
  z: number;
  /** How hard, 0 to 1. */
  power: number;
  /**
   * Kind-specific: for KICK 1 when lofted and 2 for a keeper's punt; for DIVE 1 when he
   * holds it and 2 when he is beaten; for GOAL the scoring side (0 home, 1 away) plus 2 for
   * an own goal.
   */
  flag: number;
}

/** One drawn moment of the match, already blended between two engine steps. */
export interface MatchFrame3D {
  /** Pitch metres: x 0-105 from the home goal line, y 0-68 from the far touchline. */
  px: Float32Array;
  py: Float32Array;
  /** Metres per second. */
  vx: Float32Array;
  vy: Float32Array;
  /** 1 while the player is on the pitch. */
  on: Uint8Array;
  /** Person code in each place (0-39); a substitute takes the place of the man he replaces. */
  who: Int16Array;
  ballX: number;
  ballY: number;
  /** Height in metres. */
  ballZ: number;
  ballState: number;
  /** Index of the player with the ball, or -1. */
  owner: number;
  /** The keeper has the ball in his hands. */
  inHands: boolean;
  /** A throw-in taker holds the ball over his head. */
  overhead: boolean;
  /** Match clock (ms); animation runs on this, so a paused match stands still. */
  matchMs: number;
  /** Actions that are coming up or still playing out, oldest first. */
  cues: ActionCue[];
}

export interface KitColours {
  shirt: string;
  /** Collar and cuffs. */
  trim: string;
  shorts: string;
  socks: string;
}

export interface MatchScene3D {
  /** [home, away] outfield kits. */
  kits: [KitColours, KitColours];
  /** [home, away] goalkeeper kits. */
  keepers: [KitColours, KitColours];
  /** A stable id per person code (0-39), so a player keeps his looks; '' for nobody. */
  people: string[];
  /** The home club's ground. */
  ground: StadiumSnapshot;
  night: boolean;
}
