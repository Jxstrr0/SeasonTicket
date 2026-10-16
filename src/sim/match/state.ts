/**
 * Live match state. Plain JSON data only (no classes, Sets, Maps or functions)
 * because Stage 2 saves a match mid-way. The Rng lives in `rngState`: every
 * step resumes it with Rng.fromState and writes the new state back.
 */
import type {
  MatchEvent,
  MatchSetup,
  Player,
  PlayerMatchStats,
  Side,
  Tactics,
  Team,
  TeamMatchStats,
} from '../types';

/** How a shot came about; the engine counts each kind per side. */
export type ChanceType = 'openPlay' | 'counter' | 'setPiece' | 'penalty';

export const CHANCE_TYPES: readonly ChanceType[] = ['openPlay', 'counter', 'setPiece', 'penalty'];

export type Period = 'firstHalf' | 'secondHalf' | 'etFirstHalf' | 'etSecondHalf' | 'shootout' | 'finished';

export interface SideState {
  teamId: string;
  /** Player ids by formation slot; '' marks a slot left empty after a sending-off. */
  onPitch: string[];
  bench: string[];
  tactics: Tactics;
  subsUsed: number;
  /** Energy left per player, 0-1. */
  fatigue: Record<string, number>;
  yellows: Record<string, number>;
  sentOff: string[];
  stats: TeamMatchStats;
  /** Shots by how they came about (open play, counter, set piece, penalty). */
  chances: Record<ChanceType, number>;
  playerStats: Record<string, PlayerMatchStats>;
  aiControlled: boolean;
}

export interface MatchState {
  setup: MatchSetup;
  rngState: number;
  /** Display minute of the last tick played (45 throughout first-half stoppage time). */
  minute: number;
  /** Stoppage minutes played so far in the current period (the "+2" in 45+2). */
  added: number;
  /** Stoppage minutes played across every period so far. */
  addedTotal: number;
  /** Stoppage minutes the referee has signalled for the current period; 0 until regulation ends. */
  addedPlanned: number;
  period: Period;
  homeScore: number;
  awayScore: number;
  halfTimeScore: { home: number; away: number };
  possession: Side;
  events: MatchEvent[];
  home: SideState;
  away: SideState;
  injuries: { playerId: string; weeks: number }[];
  shootout: { home: number; away: number; kicks: number } | null;
  finished: boolean;
}

export interface MatchContext {
  players: Record<string, Player>;
  teams: Record<string, Team>;
}

export function emptyTeamStats(): TeamMatchStats {
  return {
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    possession: 0,
    passes: 0,
    passAccuracy: 0,
    corners: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    offsides: 0,
    saves: 0,
    tackles: 0,
  };
}

export function emptyChanceCounts(): Record<ChanceType, number> {
  return { openPlay: 0, counter: 0, setPiece: 0, penalty: 0 };
}

export function emptyPlayerStats(playerId: string): PlayerMatchStats {
  return {
    playerId,
    minutes: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    passes: 0,
    keyPasses: 0,
    tackles: 0,
    saves: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    rating: 0,
  };
}

export function otherSide(side: Side): Side {
  return side === 'home' ? 'away' : 'home';
}

export function sideState(state: MatchState, side: Side): SideState {
  return side === 'home' ? state.home : state.away;
}

export function scoreOf(state: MatchState, side: Side): number {
  return side === 'home' ? state.homeScore : state.awayScore;
}

/** Goal difference from one side's point of view: positive when ahead. */
export function goalMargin(state: MatchState, side: Side): number {
  return scoreOf(state, side) - scoreOf(state, otherSide(side));
}

/** Ids of players currently on the pitch (empty slots skipped). */
export function playersOnPitch(sideState: SideState): string[] {
  return sideState.onPitch.filter((id) => id !== '');
}

export function ensurePlayerStats(sideState: SideState, playerId: string): PlayerMatchStats {
  let stats = sideState.playerStats[playerId];
  if (!stats) {
    stats = emptyPlayerStats(playerId);
    sideState.playerStats[playerId] = stats;
  }
  return stats;
}
