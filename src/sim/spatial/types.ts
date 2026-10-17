/**
 * Public types for the spatial match engine (Stage 4.5, docs/DESIGN.md section 17).
 *
 * Coordinates: world x runs 0..105 along the pitch (home goal at x = 0, home attacks +x),
 * world y runs 0..68 across it. Each team also has its own frame: depth d is metres from
 * its own goal line and across a is measured from its left touchline looking at the
 * opponent goal. For the home side d = x and a = y; for the away side d = 105 - x and
 * a = 68 - y.
 */
import type { Attributes, Position, Tactics, TeamColors, Weather } from '../types';

export type SpatialMode = 'fine' | 'coarse';
export type Side = 0 | 1;

export interface SpatialPlayer {
  id: string;
  name: string;
  jersey: number;
  position: Position;
  /** Other positions he can play (for reshuffles after a red card or a formation change). */
  secondary?: Position[];
  attributes: Attributes;
}

export interface SpatialSide {
  name: string;
  short: string;
  colors: TeamColors;
  tactics: Tactics;
  /** Eleven players ordered by formation slot (slot 0 is the goalkeeper). */
  players: SpatialPlayer[];
  /** Up to nine substitutes. */
  bench?: SpatialPlayer[];
  /** Energy at kick-off (0..1), starters then bench, in the same order; 1 if left out. */
  energy?: number[];
}

export interface SpatialSetup {
  home: SpatialSide;
  away: SpatialSide;
  /** A cup tie: level after 90 minutes goes to extra time, then penalties. */
  extraTime?: boolean;
  weather?: Weather;
  /** Share of the home ground's seats filled (0..1), for home advantage; none if left out. */
  crowd?: number;
}

/**
 * One input from outside the engine. Applied at `ms` exactly, so replays match. A
 * substitution waits for the next stoppage (or half-time) and a bad one is ignored.
 */
export type SpatialAction =
  | { ms: number; side: Side; type: 'tactics'; tactics: Tactics }
  | { ms: number; side: Side; type: 'sub'; outId: string; inId: string }
  | { ms: number; side: Side; type: 'cancelSub'; outId: string };

/**
 * Person codes ("who"): starters are side * 11 + place in the line-up (0..21), substitutes
 * 22 + side * 9 + place on the bench (22..39).
 */
export const PERSONS = 40;
export const BENCH_BASE = 22;
export const BENCH_MAX = 9;

/** The side a person code belongs to. */
export function whoSide(w: number): Side {
  return (w < BENCH_BASE ? (w < 11 ? 0 : 1) : w - BENCH_BASE < BENCH_MAX ? 0 : 1) as Side;
}

/** The player a person code stands for (undefined for an empty bench place). */
export function personOf(setup: SpatialSetup, w: number): SpatialPlayer | undefined {
  if (w < BENCH_BASE) return (w < 11 ? setup.home : setup.away).players[w % 11];
  const b = w - BENCH_BASE;
  return b < BENCH_MAX ? setup.home.bench?.[b] : setup.away.bench?.[b - BENCH_MAX];
}

/** The person code of player `id` on `side`, or -1. */
export function whoOf(setup: SpatialSetup, side: Side, id: string): number {
  const s = side === 0 ? setup.home : setup.away;
  const k = s.players.findIndex((p) => p.id === id);
  if (k >= 0) return side * 11 + k;
  const b = s.bench ? s.bench.findIndex((p) => p.id === id) : -1;
  return b >= 0 ? BENCH_BASE + side * BENCH_MAX + b : -1;
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
  TRACK: 8,
  /** A run in behind the defence. */
  RUN: 9,
  /** Filling a zone in the box for a cross. */
  BOX: 10,
  /** Standing in the wall for a free kick. */
  WALL: 11,
} as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

/** How a shot ended, settled when it was struck. */
export type ShotOutcome = 'goal' | 'saved' | 'blocked' | 'off' | 'post';

/**
 * One shot. Players are person codes (PERSONS above, SpatialMatch.who);
 * x, y is where it was struck.
 */
export interface ShotRecord {
  ms: number;
  side: Side;
  player: number;
  x: number;
  y: number;
  xg: number;
  header: boolean;
  outcome: ShotOutcome;
  /** A direct free kick or a penalty. */
  setPiece?: 'freeKick' | 'penalty';
}

/** One goal, credited to `side` (players as in ShotRecord). An own goal's scorer is the defender who put it in. */
export interface GoalRecord {
  ms: number;
  side: Side;
  scorer: number;
  /** The team-mate whose pass the scorer took his shot from, or -1. */
  assist: number;
  xg: number;
  ownGoal: boolean;
  header: boolean;
  /** Bundled in without a shot: counted as a shot on target for the scorer. */
  bundled?: boolean;
}

export type SpatialEventKind = 'foul' | 'advantage' | 'yellow' | 'red' | 'offside' | 'penalty' | 'injury' | 'corner' | 'sub' | 'whistle';

/**
 * A moment the referee was involved: `player` is who committed it (the fouler, the booked or
 * sent-off player, the man caught offside, the injured player, the corner taker, the player
 * going off) as in ShotRecord, `side` is his side, and x, y is where it happened. A whistle
 * (the end of a period) has player -1.
 */
export interface SpatialEvent {
  ms: number;
  kind: SpatialEventKind;
  side: Side;
  player: number;
  x: number;
  y: number;
  /** The fouled player, or the player coming on. */
  other?: number;
  /**
   * A yellow that was his second, so also a red; a yellow for wasting time; a foul in the
   * box; a red for denying a goal; which whistle (half-time, full time, the ends of the two
   * halves of extra time, the end of a shootout).
   */
  note?: 'second' | 'delay' | 'box' | 'dogso' | 'half' | 'full' | 'etHalf' | 'etFull' | 'shootout';
}

/** Periods of play (SpatialMatch.period). */
export const PERIOD = { FIRST: 0, SECOND: 1, ET_FIRST: 2, ET_SECOND: 3, SHOOTOUT: 4, DONE: 5 } as const;

/** One period as it was played: engine times and the stoppage minutes shown. */
export interface PeriodRecord {
  period: number;
  startMs: number;
  endMs: number;
  added: number;
}

/** One shootout kick: who took it (person code) and how it went. */
export interface ShootoutKick {
  side: Side;
  player: number;
  keeper: number;
  outcome: 'scored' | 'saved' | 'missed';
}

export interface ShootoutState {
  score: [number, number];
  kicks: ShootoutKick[];
  /** Kick order per side (person codes) and kicks taken. */
  order: [number[], number[]];
  taken: [number, number];
  first: Side;
  /** 0 waiting to set the next kick, 1 the kick is set, 2 struck and in flight. */
  phase: number;
  winner: Side | -1;
}

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
