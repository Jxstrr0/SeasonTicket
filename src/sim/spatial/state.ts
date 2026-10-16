/**
 * Mutable state of one spatial match. Players live in flat typed arrays indexed by
 * i = side * 11 + slot, which keeps the hot loops fast and makes the fingerprint easy.
 */
import type { Formation, Tactics } from '../types';
import type { Rng } from '../rng';
import type { LoftTable } from './ball';
import type { Side, SpatialAction, SpatialMode, SpatialSetup } from './types';

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
export const ANCHORS = 12;
export const RING = 16;

export const BALL_HELD = 0;
export const BALL_ROLL = 1;
export const BALL_AIR = 2;
export const BALL_FROZEN = 3;

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

export interface ScriptState {
  /** The carrier releases the ball at this time. */
  holdUntil: number;
  carryX: number;
  carryY: number;
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
  clockMs: number;
  endMs: number;
  rng: Rng;
  loft: LoftTable;
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
  role: Uint8Array;
  nextThink: Float64Array;
  delay: Int32Array;
  teams: [TeamState, TeamState];
  ball: BallState;
  /** Smoothed point the shapes follow: where the ball is, or where a pass is going. */
  focusX: number;
  focusY: number;
  poss: Side;
  possChanged: boolean;
  script: ScriptState;
  /** Actions not yet applied, in time order. */
  pending: SpatialAction[];
  /** Every action, applied or not, for the replay record. */
  actions: SpatialAction[];
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
