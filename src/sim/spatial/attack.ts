/**
 * Off-the-ball attacking (Stage 4.5 build step 4, docs/DESIGN.md 17.15): runs in behind the
 * defence while a team-mate has the ball facing forward, and filling the box when the ball
 * is out wide in the final third, a corner is coming or a cross is in the air.
 *
 * Same rules as the rest of the engine: random draws only through m.rng, no allocations in
 * the step, and only + - * / and Math.sqrt.
 */
import { SPATIAL_TUNING } from '../data';
import { currentOffCap, secondLastOpponent } from './shape';
import {
  A_HEA, A_STR, A_WRK, ATTRS, BALL_AIR, BALL_DEAD, BALL_HELD, LENGTH, N, RESTART_CORNER, RESTART_FREE_KICK, WIDTH,
  acrossOf, depthOf, sideOf, stepChance, type AttackState, type SpatialMatch,
} from './state';
import type { Side } from './types';

const T = SPATIAL_TUNING;
const RN = T.run;
const BX = T.box;
const CO = T.corner;
const GC = T.pitch.goalCentreAcross;
const ZONES = BX.zones.length;

export function createAttack(): AttackState {
  return {
    runUntil: new Float64Array(N),
    runNext: new Float64Array(N),
    runX: new Float64Array(N),
    runY: new Float64Array(N),
    boxSlot: new Int8Array(N).fill(-1),
    boxOn: new Uint8Array(2),
    boxSign: new Float64Array(2),
    boxCorner: new Uint8Array(2),
  };
}

/** Forget every run and box job (at a restart). */
export function resetAttack(m: SpatialMatch): void {
  const at = m.attack;
  for (let i = 0; i < N; i++) {
    at.runUntil[i] = 0;
    at.boxSlot[i] = -1;
  }
  at.boxOn[0] = 0;
  at.boxOn[1] = 0;
  at.boxCorner[0] = 0;
  at.boxCorner[1] = 0;
}

/** Wide in the final third, where the ball goes into the box from. */
function wideFinalThird(side: Side, x: number, y: number): boolean {
  const a = acrossOf(side, y);
  return depthOf(side, x) >= BX.fromDepth && (a < BX.wideWithin || a > WIDTH - BX.wideWithin);
}

/** The point of player i's box zone, in world coordinates, into out[0..1]. */
export function boxPoint(m: SpatialMatch, i: number, out: Float64Array): boolean {
  const z = m.attack.boxSlot[i];
  if (z < 0) return false;
  const side = sideOf(i);
  const zone = (m.attack.boxCorner[side] ? CO.zones : BX.zones)[z];
  out[0] = depthOf(side, zone[0]);
  out[1] = acrossOf(side, GC + m.attack.boxSign[side] * zone[1]);
  return true;
}

/** Whether box filling should be on for `side` right now. */
function boxWanted(m: SpatialMatch, side: Side): boolean {
  const b = m.ball;
  if (b.state === BALL_DEAD) {
    if (m.restartSide !== side) return false;
    if (m.restartKind === RESTART_CORNER) return true;
    // A free kick near enough to put into the box.
    return m.restartKind === RESTART_FREE_KICK && depthOf(side, m.restartX) >= LENGTH - T.freeKick.crossWithin;
  }
  if (b.state === BALL_HELD) return b.owner >= 0 && sideOf(b.owner) === side && wideFinalThird(side, b.x, b.y);
  const ob = m.onball;
  return b.state === BALL_AIR && ob.passCross && ob.passSide === side;
}

function updateBox(m: SpatialMatch, side: Side): void {
  const at = m.attack;
  const want = boxWanted(m, side);
  const o = side * 11;
  if (!want) {
    if (at.boxOn[side]) {
      at.boxOn[side] = 0;
      at.boxCorner[side] = 0;
      for (let i = o; i < o + 11; i++) if (at.boxSlot[i] >= 0) { at.boxSlot[i] = -1; m.nextThink[i] = m.clockMs; }
    }
    return;
  }
  if (at.boxOn[side]) return;
  at.boxOn[side] = 1;
  const b = m.ball;
  const by = b.state === BALL_DEAD ? m.restartY : b.y;
  at.boxSign[side] = acrossOf(side, by) < GC ? -1 : 1;
  const team = m.teams[side];
  if (b.state === BALL_DEAD && m.restartKind === RESTART_CORNER) { cornerBox(m, side); return; }
  const n = Math.min(ZONES, BX.count[team.tactics.mentality - 1]);
  // Each zone in turn goes to the nearest outfielder not already given one, leaving the ball
  // carrier, the taker and the players who stay behind the ball.
  for (let z = 0; z < n; z++) {
    const zone = BX.zones[z];
    const zx = depthOf(side, zone[0]);
    const zy = acrossOf(side, GC + at.boxSign[side] * zone[1]);
    let best = -1, bd2 = Infinity;
    for (let s = 1; s < 11; s++) {
      const i = o + s;
      if (!m.on[i] || team.isBehind[s] || at.boxSlot[i] >= 0 || i === b.owner || i === m.restartTaker) continue;
      const dx = m.px[i] - zx, dy = m.py[i] - zy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd2) { bd2 = d2; best = i; }
    }
    if (best < 0) break;
    at.boxSlot[best] = z;
    at.runUntil[best] = 0;
    m.nextThink[best] = m.clockMs;
  }
}

/** A corner: the best in the air go up, into the corner zones in turn (best header first). */
function cornerBox(m: SpatialMatch, side: Side): void {
  const at = m.attack;
  const o = side * 11;
  const team = m.teams[side];
  const att = m.onball.attr;
  at.boxCorner[side] = 1;
  const n = Math.min(CO.zones.length, CO.count[team.tactics.mentality - 1]);
  for (let z = 0; z < n; z++) {
    let best = -1, bv = -Infinity;
    for (let s = 1; s < 11; s++) {
      const i = o + s;
      if (!m.on[i] || at.boxSlot[i] >= 0 || i === m.restartTaker) continue;
      const v = att[i * ATTRS + A_HEA] + att[i * ATTRS + A_STR] / 2;
      if (v > bv) { bv = v; best = i; }
    }
    if (best < 0) break;
    at.boxSlot[best] = z;
    at.runUntil[best] = 0;
    m.nextThink[best] = m.clockMs;
  }
}

function updateRuns(m: SpatialMatch, side: Side): void {
  const at = m.attack;
  const b = m.ball;
  const now = m.clockMs;
  const o = side * 11;
  const c = b.owner;
  if (b.state !== BALL_HELD || c < 0 || sideOf(c) !== side) return;
  const ob = m.onball;
  if (ob.pressured || (side === 0 ? ob.faceX[c] : -ob.faceX[c]) <= 0) return;
  const line = secondLastOpponent(m, side);
  if (line > RN.maxLine) return;
  let running = 0;
  for (let i = o; i < o + 11; i++) if (now < at.runUntil[i]) running++;
  if (running >= RN.maxRunners) return;
  const team = m.teams[side];
  const cap = currentOffCap(team, m.steps);
  const bd = depthOf(side, b.x);
  const att = ob.attr;
  for (let s = 1; s < 11 && running < RN.maxRunners; s++) {
    const i = o + s;
    if (i === c || !m.on[i] || team.isBehind[s] || at.boxSlot[i] >= 0 || now < at.runUntil[i] || now < at.runNext[i]) continue;
    const d = depthOf(side, m.px[i]);
    if (d < cap - RN.shoulder || d < bd + RN.aheadOfBall) continue;
    const wrk = att[i * ATTRS + A_WRK] / 99;
    if (!m.rng.chance(stepChance(m, RN.rate * (RN.wrkBase + (1 - RN.wrkBase) * wrk)))) continue;
    const a = acrossOf(side, m.py[i]);
    at.runUntil[i] = now + RN.seconds * 1000;
    at.runNext[i] = at.runUntil[i] + RN.cooldown * 1000;
    at.runX[i] = depthOf(side, Math.min(line + RN.length, RN.maxDepth));
    at.runY[i] = acrossOf(side, a + (GC - a) * RN.inward);
    m.nextThink[i] = now;
    running++;
    // The carrier looks up again to find him.
    ob.decideAt = now;
  }
}

/** One step of off-the-ball attacking for both sides. Runs before the on-ball step. */
export function updateAttack(m: SpatialMatch): void {
  const at = m.attack;
  // The side without the ball stops its runs.
  const lost = (1 - m.poss) * 11;
  for (let i = lost; i < lost + 11; i++) if (at.runUntil[i] > 0) { at.runUntil[i] = 0; m.nextThink[i] = m.clockMs; }
  for (let side = 0 as Side; side < 2; side = (side + 1) as Side) {
    updateBox(m, side);
    updateRuns(m, side);
  }
}
