/**
 * Public types for the spatial match engine (Stage 4.5, docs/DESIGN.md section 17).
 *
 * Coordinates: world x runs 0..105 along the pitch (home goal at x = 0, home attacks +x),
 * world y runs 0..68 across it. Each team also has its own frame: depth d is metres from
 * its own goal line and across a is measured from its left touchline looking at the
 * opponent goal. For the home side d = x and a = y; for the away side d = 105 - x and
 * a = 68 - y.
 */
import type { Attributes, Position, Tactics, TeamColors } from '../types';

export type SpatialMode = 'fine' | 'coarse';
export type Side = 0 | 1;

export interface SpatialPlayer {
  id: string;
  name: string;
  jersey: number;
  position: Position;
  attributes: Attributes;
}

export interface SpatialSide {
  name: string;
  short: string;
  colors: TeamColors;
  tactics: Tactics;
  /** Eleven players ordered by formation slot (slot 0 is the goalkeeper). */
  players: SpatialPlayer[];
}

export interface SpatialSetup {
  home: SpatialSide;
  away: SpatialSide;
}

/** One input from outside the engine. Applied at `ms` exactly, so replays match. */
export interface SpatialAction {
  ms: number;
  side: Side;
  type: 'tactics';
  tactics: Tactics;
}

/** Everything needed to replay a match exactly: no position frames are stored. */
export interface SpatialRecord {
  rev: number;
  seed: string;
  mode: SpatialMode;
  setup: SpatialSetup;
  actions: SpatialAction[];
}

/** What each player is doing right now. Shown in the 2D viewer and used by tests. */
export const ROLE = {
  SHAPE: 0,
  KEEPER: 1,
  CARRY: 2,
  RECEIVE: 3,
  PRESS: 4,
  COVER: 5,
  MARK: 6,
  COUNTER: 7,
} as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

/** Values per frame: 22 players (x, y) then the ball (x, y, z), all in centimetres. */
export const FRAME_VALUES = 47;

export interface TeamShapeInfo {
  /** Mean depth of the back-line players (slots with def u = 0), in the team's frame. */
  backLine: number;
  /** The line height the team is currently aiming for (blended between in and out of possession). */
  targetLine: number;
  /** Distance from the deepest to the highest outfielder. */
  length: number;
  /** Distance between the two widest outfielders. */
  width: number;
}
