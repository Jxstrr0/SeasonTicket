/**
 * Turns the players on the pitch into the handful of numbers the tick model
 * uses: an effective attribute per player (fatigue applied) and four unit
 * strengths per side (goalkeeper, defense, midfield, attack).
 */
import { MATCH_TUNING } from '../data';
import type { AttributeKey, Dial, Formation, Player, Position } from '../types';
import type { MatchContext, SideState } from './state';

export type Unit = 'goalkeeper' | 'defender' | 'midfielder' | 'attacker';

type AttributeWeights = Partial<Record<AttributeKey, number>>;

const T = MATCH_TUNING;
const UNIT_BY_POSITION = T.units.byPosition as Record<Position, Unit>;

export function unitOfPosition(position: Position): Unit {
  return UNIT_BY_POSITION[position];
}

/** Reads a five-entry tuning table by dial value (1-5). */
export function byDial(table: number[], dial: Dial): number {
  return table[dial - 1];
}

/** Attribute relative to the league midpoint, roughly -0.6..0.4. */
export function relative(value: number): number {
  return (value - T.attributes.mid) / T.attributes.scale;
}

export function fatigueFactor(energy: number): number {
  return 1 - T.attributes.fatiguePenalty * (1 - energy);
}

export function effective(player: Player, energy: number, key: AttributeKey): number {
  return player.attributes[key] * fatigueFactor(energy);
}

/** Weighted mean of a player's effective attributes, on the 1-99 scale. */
export function weightedAttributes(player: Player, energy: number, weights: AttributeWeights): number {
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    total += effective(player, energy, key) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? total / weightSum : 0;
}

export function energyOf(side: SideState, playerId: string): number {
  return side.fatigue[playerId] ?? 1;
}

/**
 * The unit a player plays in right now: a goalkeeper is always the goalkeeper
 * wherever he stands, otherwise the formation slot decides.
 */
export function unitOnPitch(side: SideState, slotIndex: number, formation: Formation, ctx: MatchContext): Unit {
  const id = side.onPitch[slotIndex];
  const player = ctx.players[id];
  if (player && player.position === 'GK') return 'goalkeeper';
  return unitOfPosition(formation.slots[slotIndex].position);
}

/** The player minding the goal: a real keeper if one is on, else whoever is in slot 0, else anyone. */
export function goalkeeperId(side: SideState, ctx: MatchContext): string | null {
  for (const id of side.onPitch) {
    if (id !== '' && ctx.players[id]?.position === 'GK') return id;
  }
  if (side.onPitch[0] !== '') return side.onPitch[0];
  return side.onPitch.find((id) => id !== '') ?? null;
}

export interface SideStrength {
  goalkeeper: number;
  defense: number;
  midfield: number;
  attack: number;
  /** Players actually on the pitch. */
  present: number;
}

export function goalkeeperQuality(side: SideState, ctx: MatchContext): number {
  const id = goalkeeperId(side, ctx);
  if (id === null) return 0;
  const player = ctx.players[id];
  const quality = weightedAttributes(player, energyOf(side, id), T.strength.goalkeeper.weights as AttributeWeights);
  return player.position === 'GK' ? quality : quality * T.strength.outfieldInGoalFactor;
}

/** Unit strengths with formation bias, mentality and a short-handed penalty applied. */
export function sideStrength(side: SideState, formation: Formation, ctx: MatchContext): SideStrength {
  const units = formation.slots.map((slot) => unitOnPitch(side, slot.index, formation, ctx));
  const present = side.onPitch.filter((id) => id !== '').length;
  const missing = formation.slots.length - present;
  const shortHanded = Math.pow(1 - T.strength.shortHandedPenalty, missing);

  const unitScore = (spec: { weights: object; unitShare: Record<Unit, number> }): number => {
    let total = 0;
    let shareSum = 0;
    side.onPitch.forEach((id, index) => {
      if (id === '') return;
      const share = spec.unitShare[units[index]];
      if (share <= 0) return;
      total += share * weightedAttributes(ctx.players[id], energyOf(side, id), spec.weights as AttributeWeights);
      shareSum += share;
    });
    return shareSum > 0 ? total / shareSum : 0;
  };

  const bias = (formation.defensiveBias - 0.5) * T.strength.formationBiasScale;
  const mentalityOffset = side.tactics.mentality - T.dials.balanced;
  const attackMultiplier = (1 - bias) * (1 + mentalityOffset * T.strength.mentalityAttackStep);
  const defenseMultiplier = (1 + bias) * (1 - mentalityOffset * T.strength.mentalityDefenseStep);

  return {
    goalkeeper: goalkeeperQuality(side, ctx) * shortHanded,
    defense: unitScore(T.strength.defense) * defenseMultiplier * shortHanded,
    midfield: unitScore(T.strength.midfield) * shortHanded,
    attack: unitScore(T.strength.attack) * attackMultiplier * shortHanded,
    present,
  };
}

/** Mean of one effective attribute across the players of a unit (0 when the unit is empty). */
export function unitAttribute(side: SideState, formation: Formation, ctx: MatchContext, unit: Unit, key: AttributeKey): number {
  let total = 0;
  let count = 0;
  side.onPitch.forEach((id, index) => {
    if (id === '' || unitOnPitch(side, index, formation, ctx) !== unit) return;
    total += effective(ctx.players[id], energyOf(side, id), key);
    count += 1;
  });
  return count > 0 ? total / count : 0;
}
