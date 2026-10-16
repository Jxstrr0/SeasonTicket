/**
 * Player generation, ratings, money curves and offseason development.
 *
 * Every number here comes from src/data/tuning/players.json. Attributes are
 * drawn around a per-position archetype, shifted by club quality, squad tier
 * and age; overall is a per-position weighted average of those attributes.
 */
import type { AttributeKey, Attributes, NationId, Player, Position } from './types';
import { POSITIONS } from './types';
import { PLAYERS_TUNING } from './data';
import type { Rng } from './rng';
import { defaultNames, foreignNations, homeNationId, type NameSource, type NationWeight } from './names';

export type PlayerTier = 'starter' | 'rotation' | 'youth';

export interface IdSource {
  next(prefix: string): string;
}

export interface GeneratePlayerOptions {
  position: Position;
  nationality: NationId;
  /** Club squad quality 0-1. */
  quality: number;
  age?: number;
  tier?: PlayerTier;
}

export interface GenerateSquadOptions {
  /** Share of the squad that is Valmeran. Defaults to the JSON value. */
  domesticShare?: number;
  /** Foreign nations to draw from. Defaults to world.json; tests inject a list so they pass before the world is authored. */
  nations?: readonly NationWeight[];
}

/** Fixed iteration order so attribute draws consume the Rng identically every run. */
export const ATTRIBUTE_KEYS: readonly AttributeKey[] = [
  'pac', 'sta', 'str',
  'dri', 'pas', 'vis', 'fin', 'hea', 'crs', 'spk',
  'tck', 'mrk', 'pos',
  'cmp', 'wrk', 'agg',
  'ref', 'han', 'kck', 'gkp',
  'dur',
];

const T = PLAYERS_TUNING;

/** Id prefix for players. */
const PLAYER_ID_PREFIX = 'p';

// ---------------------------------------------------------------------------
// Curves and small numeric helpers
// ---------------------------------------------------------------------------

type CurvePoint = readonly number[];

/** Finds the anchor pair around x; returns the end value when x is outside the anchors. */
function interpolateCurve(points: readonly CurvePoint[], x: number, mix: (y0: number, y1: number, t: number) => number): number {
  if (points.length === 0) throw new Error('Curve has no anchors');
  const first = points[0];
  const last = points[points.length - 1];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return mix(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return last[1];
}

/** Piecewise-linear curve through sorted [x, y] anchors, flat beyond the ends. */
export function curveAt(points: readonly CurvePoint[], x: number): number {
  return interpolateCurve(points, x, (y0, y1, t) => y0 + (y1 - y0) * t);
}

/** Like curveAt but interpolates in log space, so each anchor gap is a constant growth rate. */
export function logCurveAt(points: readonly CurvePoint[], x: number): number {
  return interpolateCurve(points, x, (y0, y1, t) => y0 * Math.pow(y1 / y0, t));
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/** Clamps a rating or attribute into the 1-99 band. */
export function clampRating(x: number): number {
  return clamp(x, T.ratingRange.min, T.ratingRange.max);
}

/** Rounds to the nearest multiple of step (e.g. the nearest 1,000 dollars). */
export function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

/** Rounds up with probability equal to the fraction, so small repeated gains are not lost to rounding. */
function roundStochastic(rng: Rng, x: number): number {
  const whole = Math.floor(x);
  return whole + (rng.chance(x - whole) ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

function overallWeights(position: Position): Partial<Record<AttributeKey, number>> {
  return T.overallWeights[position];
}

/** 1-99 overall at a position: the position's weighted average of attributes. */
export function computeOverall(attributes: Attributes, position: Position): number {
  const weights = overallWeights(position);
  let total = 0;
  let weightSum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key] ?? 0;
    total += attributes[key] * w;
    weightSum += w;
  }
  if (weightSum <= 0) throw new Error(`No overall weights for ${position}`);
  return clampRating(Math.round(total / weightSum));
}

/** How well a player covers a position: 1 at home, ~0.92 at a listed secondary, lower elsewhere. */
export function positionFit(player: Player, position: Position): number {
  if (position === player.position) return 1;
  if (player.secondaryPositions.includes(position)) return T.positionFit.secondary;
  const row: Record<Position, number> = T.positionFit.table[player.position];
  return row[position];
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Wage per season in dollars, from the overall curve, rounded to the nearest 1,000. */
export function wageFor(player: Player): number {
  const w = T.wage;
  return Math.max(w.min, roundTo(logCurveAt(w.curve, player.overall), w.roundTo));
}

/** Market value in dollars: steep in overall, a premium for headroom, a discount with age, GKs a little cheaper. */
export function marketValue(player: Player): number {
  const v = T.value;
  const base = logCurveAt(v.curve, player.overall);
  const ageMultiplier = curveAt(v.ageMultiplier, player.age);
  const headroom = Math.max(0, player.potential - player.overall);
  const potentialMultiplier = 1 + headroom * v.potentialPremiumPerPoint;
  const gkMultiplier = player.position === 'GK' ? v.gkMultiplier : 1;
  const raw = base * ageMultiplier * potentialMultiplier * gkMultiplier;
  return Math.max(v.min, roundTo(raw, v.roundTo));
}

/** Overall and value follow from attributes; potential can never sit below overall. */
export function recomputeDerived(player: Player): void {
  player.overall = computeOverall(player.attributes, player.position);
  if (player.potential < player.overall) player.potential = player.overall;
  player.value = marketValue(player);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function drawAge(rng: Rng, tier: PlayerTier): number {
  const range = T.ages[tier];
  return rng.int(range.min, range.max);
}

/** The shift applied to every attribute mean: club quality, squad tier, age and a per-player lean. */
function attributeShift(rng: Rng, quality: number, tier: PlayerTier, age: number): number {
  const g = T.generation;
  return (clamp01(quality) - 0.5) * g.qualitySpan + g.tierShift[tier] + curveAt(g.ageCurve, age) + rng.normal(0, g.playerSd);
}

function drawAttributes(rng: Rng, position: Position, quality: number, tier: PlayerTier, age: number): Attributes {
  const archetype: Record<AttributeKey, number> = T.archetypes[position];
  const shift = attributeShift(rng, quality, tier, age);
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    out[key] = clampRating(Math.round(rng.normal(archetype[key] + shift, T.generation.attributeSd)));
  }
  return out;
}

/** Ceiling above the current overall: more years under the peak age means more headroom. */
function drawPotential(rng: Rng, overall: number, age: number): number {
  const p = T.potential;
  const yearsToPeak = p.peakAge - age;
  if (yearsToPeak <= 0) return overall;
  const headroom = Math.max(0, yearsToPeak * p.perYearUnderPeak + rng.normal(0, p.noiseSd));
  return clampRating(overall + Math.round(headroom));
}

function drawSecondaryPositions(rng: Rng, position: Position): Position[] {
  const s = T.secondaryPositions;
  const adjacent = rng.shuffle(s.adjacency[position] as Position[]);
  const out: Position[] = [];
  adjacent.forEach((candidate, i) => {
    const chance = i === 0 ? s.firstChance : s.extraChance;
    if (rng.chance(chance)) out.push(candidate);
  });
  return out;
}

export function generatePlayer(rng: Rng, opts: GeneratePlayerOptions, ids: IdSource, names: NameSource = defaultNames): Player {
  const tier = opts.tier ?? 'rotation';
  const age = opts.age ?? drawAge(rng, tier);
  const id = ids.next(PLAYER_ID_PREFIX);
  const firstName = names.firstName(rng, opts.nationality);
  const lastName = names.lastName(rng, opts.nationality);
  const attributes = drawAttributes(rng, opts.position, opts.quality, tier, age);
  const overall = computeOverall(attributes, opts.position);
  const potential = drawPotential(rng, overall, age);
  const secondaryPositions = drawSecondaryPositions(rng, opts.position);
  const years = rng.int(T.contract.minYears, T.contract.maxYears);
  const jersey = rng.int(T.squad.jersey.min, T.squad.jersey.max);

  const player: Player = {
    id,
    firstName,
    lastName,
    position: opts.position,
    secondaryPositions,
    age,
    nationality: opts.nationality,
    attributes,
    overall,
    potential,
    contract: { wage: 0, years },
    teamId: null,
    injuryWeeks: 0,
    suspensionMatches: 0,
    seasonYellows: 0,
    condition: 1,
    form: [],
    jersey,
    value: 0,
  };
  player.contract.wage = wageFor(player);
  player.value = marketValue(player);
  return player;
}

/** Home nation with probability domesticShare, otherwise a weighted draw from the foreign nations (home when there are none). */
export function pickNationality(rng: Rng, domesticShare: number, nations: readonly NationWeight[]): NationId {
  const home = homeNationId();
  const foreign = nations.filter((n) => n.id !== home && n.weight > 0);
  if (foreign.length === 0 || rng.chance(domesticShare)) return home;
  return rng.weighted(foreign, (n) => n.weight).id;
}

interface SquadSlot {
  position: Position;
  tier: PlayerTier;
}

/** Expands the squad template into slots: the starters template first at each position, the rest rotation. */
function templateSlots(): SquadSlot[] {
  const slots: SquadSlot[] = [];
  for (const position of POSITIONS) {
    const total = T.squad.template[position];
    const starters = T.squad.startersTemplate[position];
    if (starters > total) throw new Error(`Starters template exceeds squad template at ${position}`);
    for (let i = 0; i < total; i++) slots.push({ position, tier: i < starters ? 'starter' : 'rotation' });
  }
  return slots;
}

/** Turns a few rotation slots into youth slots. */
function assignYouthSlots(rng: Rng, slots: SquadSlot[]): void {
  const rotationIndexes = slots.map((s, i) => (s.tier === 'rotation' ? i : -1)).filter((i) => i >= 0);
  const youthCount = Math.min(rotationIndexes.length, rng.int(T.squad.youthCount.min, T.squad.youthCount.max));
  for (const index of rng.shuffle(rotationIndexes).slice(0, youthCount)) slots[index].tier = 'youth';
}

/** Unique squad numbers; the first goalkeeper takes the conventional number. */
function assignJerseys(rng: Rng, players: Player[]): void {
  const j = T.squad.jersey;
  const pool: number[] = [];
  for (let n = j.min; n <= j.max; n++) if (n !== j.goalkeeper) pool.push(n);
  const available = rng.shuffle(pool);
  let goalkeeperTaken = false;
  for (const player of players) {
    if (player.position === 'GK' && !goalkeeperTaken) {
      player.jersey = j.goalkeeper;
      goalkeeperTaken = true;
      continue;
    }
    const next = available.pop();
    if (next === undefined) throw new Error('Ran out of jersey numbers');
    player.jersey = next;
  }
}

export function generateSquad(
  rng: Rng,
  teamId: string,
  quality: number,
  ids: IdSource,
  names: NameSource = defaultNames,
  opts: GenerateSquadOptions = {},
): Player[] {
  const domesticShare = opts.domesticShare ?? T.squad.domesticShare;
  const slots = templateSlots();
  assignYouthSlots(rng, slots);
  const nations = opts.nations ?? foreignNations();
  const players = slots.map((slot) => {
    const nationality = pickNationality(rng, domesticShare, nations);
    const player = generatePlayer(rng, { position: slot.position, nationality, quality, tier: slot.tier }, ids, names);
    player.teamId = teamId;
    return player;
  });
  assignJerseys(rng, players);
  return players;
}

// ---------------------------------------------------------------------------
// Development
// ---------------------------------------------------------------------------

function bumpAttribute(rng: Rng, attributes: Attributes, key: AttributeKey, delta: number): void {
  attributes[key] = clampRating(attributes[key] + roundStochastic(rng, delta));
}

/** Growth lands mostly on the attributes the position is rated on, with a little everywhere. */
function applyGrowth(rng: Rng, player: Player, coachingQuality: number): void {
  const d = T.development;
  const gap = Math.max(0, player.potential - player.overall);
  if (gap <= 0) return; // at the ceiling: a plateau, not a slow drift
  const coachFactor = d.coachingFloor + d.coachingSpan * clamp01(coachingQuality);
  const expected = gap * d.gapRate * curveAt(d.growthAgeFactor, player.age) * coachFactor;
  const growth = Math.max(0, expected + rng.normal(0, d.noiseSd));
  if (growth <= 0) return;
  const weights = overallWeights(player.position);
  const maxWeight = Math.max(...ATTRIBUTE_KEYS.map((k) => weights[k] ?? 0));
  for (const key of ATTRIBUTE_KEYS) {
    const share = d.spread.base + d.spread.key * ((weights[key] ?? 0) / maxWeight);
    bumpAttribute(rng, player.attributes, key, growth * share);
  }
}

/** Decline deepens each year past the decline age; legs go first, the head holds up best. */
function applyDecline(rng: Rng, player: Player, coachingQuality: number): void {
  const d = T.development;
  const yearsIn = player.age - d.declineAge + 1;
  const relief = 1 - d.coachDeclineRelief * clamp01(coachingQuality);
  const loss = Math.max(0, yearsIn * d.declinePerYear * relief + rng.normal(0, d.noiseSd));
  if (loss <= 0) return;
  for (const key of ATTRIBUTE_KEYS) {
    const multiplier = d.physical.includes(key)
      ? d.physicalDeclineMultiplier
      : d.mental.includes(key)
        ? d.mentalDeclineMultiplier
        : 1;
    bumpAttribute(rng, player.attributes, key, -loss * multiplier);
  }
}

/**
 * One offseason of change. Young players grow toward their potential (faster
 * with good coaching); players at or past the decline age lose a little, and
 * their ceiling collapses to where they are. Age itself is advanced by the
 * season module, not here.
 */
export function developPlayer(rng: Rng, player: Player, coachingQuality: number): void {
  const declining = player.age >= T.development.declineAge;
  if (declining) applyDecline(rng, player, coachingQuality);
  else applyGrowth(rng, player, coachingQuality);
  recomputeDerived(player);
  if (declining) player.potential = player.overall;
}
