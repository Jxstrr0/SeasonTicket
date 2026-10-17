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
  /** Match clock (ms); animation runs on this, so a paused match stands still. */
  matchMs: number;
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
