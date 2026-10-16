/**
 * Position fit and slot assignment shared by the AI head coach (team
 * selection) and the engine (re-shaping a side after a formation change).
 */
import { COACH_TUNING } from '../data';
import type { Formation, FormationSlot, Player, Position } from '../types';

type FitTable = Partial<Record<Position, Partial<Record<Position, number>>>>;

const FIT = COACH_TUNING.positionFit;
const ADJACENT = FIT.adjacent as unknown as FitTable;

/** 0-1 share of a player's ability that survives playing in a slot. */
export function positionFit(player: Player, slotPosition: Position): number {
  if (player.position === slotPosition) return FIT.same;
  if (player.secondaryPositions.includes(slotPosition)) return FIT.secondary;
  if (player.position === 'GK') return FIT.goalkeeperOutfield;
  if (slotPosition === 'GK') return FIT.outfieldInGoal;
  const adjacent = ADJACENT[player.position]?.[slotPosition];
  return adjacent ?? FIT.fallback;
}

export type SlotScore = (player: Player, slot: FormationSlot) => number;

/**
 * Greedy best-pair assignment: repeatedly commits the highest-scoring
 * (player, slot) pair still available. Returns one id per slot, '' where no
 * player was left. Ties break on slot index then player id so the result is
 * the same on every run.
 */
export function assignToSlots(
  playerIds: readonly string[],
  formation: Formation,
  players: Record<string, Player>,
  score: SlotScore,
): string[] {
  const pairs: { id: string; slot: number; score: number }[] = [];
  for (const id of playerIds) {
    const player = players[id];
    if (!player) continue;
    for (const slot of formation.slots) pairs.push({ id, slot: slot.index, score: score(player, slot) });
  }
  pairs.sort((a, b) => b.score - a.score || a.slot - b.slot || compareIds(a.id, b.id));

  const result: string[] = formation.slots.map(() => '');
  const used = new Set<string>();
  for (const pair of pairs) {
    if (used.has(pair.id) || result[pair.slot] !== '') continue;
    result[pair.slot] = pair.id;
    used.add(pair.id);
  }
  return result;
}

/** Fit-weighted ability, the default way to rank a player for a slot. */
export function slotAbility(player: Player, slot: FormationSlot): number {
  return positionFit(player, slot.position) * player.overall;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
