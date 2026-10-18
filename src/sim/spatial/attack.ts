/**
 * Off-the-ball attacking (Stage 4.5 build step 4, docs/DESIGN.md 17.15): runs in behind the
 * defence while a team-mate has the ball facing forward, and filling the box when the ball
 * is out wide in the final third, a corner is coming or a cross is in the air; and getting
 * open for a pass, each player near the play finding his own space.
 *
 * Same rules as the rest of the engine: random draws only through m.rng, no allocations in
 * the step, and only + - * / and Math.sqrt.
 */
import { SPATIAL_TUNING } from '../data';
import { PI, detCos, detSin } from './det';
import { threatAt } from './onball';
import { currentBehindCap, currentOffCap, secondLastOpponent } from './shape';
import {
  A_HEA, A_STR, A_VIS, A_WRK, ATTRS, BALL_AIR, BALL_DEAD, BALL_HELD, LENGTH, N, RESTART_CORNER, RESTART_FREE_KICK, WIDTH,
  acrossOf, clamp, depthOf, sideOf, stepChance, type AttackState, type SpatialMatch,
} from './state';
import { ROLE, type Side } from './types';

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
    supX: new Float64Array(N),
    supY: new Float64Array(N),
    supNext: new Float64Array(N),
    supBurst: new Float64Array(N),
    supOn: new Uint8Array(2),
  };
}

/** Forget every run, box job and open spot (at a restart). */
export function resetAttack(m: SpatialMatch): void {
  const at = m.attack;
  for (let i = 0; i < N; i++) {
    at.runUntil[i] = 0;
    at.boxSlot[i] = -1;
    at.supX[i] = 0;
    at.supY[i] = 0;
    at.supNext[i] = 0;
    at.supBurst[i] = 0;
  }
  at.supOn[0] = 0;
  at.supOn[1] = 0;
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
  if (b.state === BALL_HELD) return b.owner >= 0 && sideOf(b.owner) === side && (wideFinalThird(side, b.x, b.y) || depthOf(side, b.x) >= BX.centralFrom);
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

// ---------------------------------------------------------------------------
// Getting open
// ---------------------------------------------------------------------------

const SU = T.support;
const DIRS = SU.directions;
const DIR_X = Float64Array.from({ length: DIRS }, (_, k) => detCos((2 * PI * k) / DIRS));
const DIR_Y = Float64Array.from({ length: DIRS }, (_, k) => detSin((2 * PI * k) / DIRS));
const WITHIN2 = SU.withinBall * SU.withinBall;
const CROWD2 = SU.crowdWithin * SU.crowdWithin;
// Scratch for one look round: the candidate spots, and the opponents and team-mates near
// enough to any of them to change its score (the rest cannot, so they are skipped).
const CX = new Float64Array(DIRS + 2);
const CY = new Float64Array(DIRS + 2);
const OPP = new Int32Array(11);
const MATE = new Int32Array(11);
let nOpp = 0, nMate = 0;
const OPP_R = Math.max(SU.spaceCap, SU.laneCap);

/** Forget every player's open spot (at a restart, or when the ball is lost). */
function clearSupport(m: SpatialMatch, side: Side): void {
  const at = m.attack;
  for (let i = side * 11; i < side * 11 + 11; i++) {
    at.supX[i] = 0;
    at.supY[i] = 0;
    at.supNext[i] = 0;
    at.supBurst[i] = 0;
  }
}

/**
 * How good a place (x, y) is for player i of `side` to take a pass from the ball at (bx, by):
 * room from the nearest opponent, a clear line from the ball, a bigger threat than his shape
 * spot (sx, sy), not too far from that spot, not on top of a team-mate and not so close to
 * the carrier that he crowds him.
 */
function openScore(m: SpatialMatch, side: Side, x: number, y: number, bx: number, by: number, sx: number, sy: number, reach: number, base: number): number {
  const lx = x - bx, ly = y - by;
  const L2 = lx * lx + ly * ly;
  let near2 = Infinity, lane = SU.laneCap;
  for (let q = 0; q < nOpp; q++) {
    const j = OPP[q];
    const ex = m.px[j] - x, ey = m.py[j] - y;
    const e2 = ex * ex + ey * ey;
    if (e2 < near2) near2 = e2;
    // In the way of the pass: between the ball and the spot, close to the line.
    if (L2 > 1e-9) {
      const f = ((m.px[j] - bx) * lx + (m.py[j] - by) * ly) / L2;
      if (f > SU.laneFrom && f < 1) {
        const qx = m.px[j] - (bx + f * lx), qy = m.py[j] - (by + f * ly);
        const q2 = qx * qx + qy * qy;
        if (q2 < lane * lane) lane = Math.sqrt(q2);
      }
    }
  }
  const near = near2 < SU.spaceCap * SU.spaceCap ? Math.sqrt(near2) : SU.spaceCap;
  let s = SU.wSpace * (near / SU.spaceCap) + SU.wLane * (lane / SU.laneCap);
  s += SU.wThreat * clamp((threatAt(side, x, y) - base) / SU.threatScale, -1, 1);
  const ox = x - sx, oy = y - sy;
  s -= (SU.wStray * (ox * ox + oy * oy)) / (reach * reach);
  if (L2 < SU.minPass * SU.minPass) s -= SU.wShort * (1 - Math.sqrt(L2) / SU.minPass);
  for (let q = 0; q < nMate; q++) {
    const k = MATE[q];
    const cx = m.tx[k] - x, cy = m.ty[k] - y;
    const c2 = cx * cx + cy * cy;
    if (c2 < CROWD2) s -= SU.wCrowd * (1 - Math.sqrt(c2) / SU.crowdWithin);
  }
  return s;
}

/**
 * One step of getting open for the side on the ball, after the shape spots are worked out.
 * Each player in his shape near the ball looks again every so often (hard workers sooner),
 * scores where he is, his shape spot and a ring of spots around where he is going, and takes
 * the best; how well he reads it (vision) decides how much chance there is in the pick.
 */
export function updateSupport(m: SpatialMatch): void {
  const side = m.poss;
  const other = (1 - side) as Side;
  const at = m.attack;
  if (at.supOn[other]) { at.supOn[other] = 0; clearSupport(m, other); }
  const b = m.ball;
  if (b.state === BALL_DEAD) {
    if (at.supOn[side]) { at.supOn[side] = 0; clearSupport(m, side); }
    return;
  }
  // The game is won: no more running off the ball.
  if (m.score[side] - m.score[other] >= SU.easeLead) {
    if (at.supOn[side]) { at.supOn[side] = 0; clearSupport(m, side); }
    return;
  }
  const c = b.owner;
  if (b.state !== BALL_HELD || c < 0 || sideOf(c) !== side) return;
  at.supOn[side] = 1;
  const now = m.clockMs;
  const team = m.teams[side];
  const cap = currentOffCap(team, m.steps);
  const behind = currentBehindCap(team, m.steps);
  const att = m.onball.attr;
  const every = m.mode === 'fine' ? 1 : SU.coarseEvery;
  const dirStep = m.mode === 'fine' ? 1 : SU.coarseDirStep;
  const o = side * 11;
  for (let s = 1; s < 11; s++) {
    const i = o + s;
    if (i === c || !m.on[i] || m.role[i] !== ROLE.SHAPE || now < at.supNext[i]) continue;
    const dx = m.px[i] - b.x, dy = m.py[i] - b.y;
    if (dx * dx + dy * dy > WITHIN2) {
      // Far from the play: back to his shape spot.
      at.supX[i] = 0;
      at.supY[i] = 0;
      continue;
    }
    const wrk = att[i * ATTRS + A_WRK] / 99;
    const vis = att[i * ATTRS + A_VIS] / 99;
    at.supNext[i] = now + (SU.everyMs[1] - (SU.everyMs[1] - SU.everyMs[0]) * wrk + m.rng.next() * SU.jitterMs) * every;
    const reach = team.isBehind[s] ? SU.behindReach : SU.reach[0] + (SU.reach[1] - SU.reach[0]) * wrk;
    const sx = m.sx[i], sy = m.sy[i];
    const base = threatAt(side, sx, sy);
    const noise = SU.noise * (1 - SU.visionCut * vis);
    const lim = team.isBehind[s] ? Math.min(cap, behind) : cap;
    const curX = at.supX[i], curY = at.supY[i];
    // The spots: k = -2 where he is going now, -1 his shape spot, 0.. the ring round where he is going.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = -2; k < DIRS; k = k < 0 ? k + 1 : k + dirStep) {
      let ox = curX, oy = curY;
      if (k === -1) { ox = 0; oy = 0; }
      else if (k >= 0) { ox = curX + DIR_X[k] * SU.step; oy = curY + DIR_Y[k] * SU.step; }
      const r2 = ox * ox + oy * oy;
      if (r2 > reach * reach) { const f = reach / Math.sqrt(r2); ox *= f; oy *= f; }
      if (side === 0 ? ox > SU.forward : ox < -SU.forward) ox = side === 0 ? SU.forward : -SU.forward;
      let x = clamp(sx + ox, 1, LENGTH - 1);
      const y = clamp(sy + oy, T.touchlineMargin, WIDTH - T.touchlineMargin);
      if (depthOf(side, x) > lim) x = depthOf(side, lim);
      CX[k + 2] = x;
      CY[k + 2] = y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    // Team-mates whose spot is within crowdWithin of the spots' box, and opponents within
    // OPP_R of the box round the spots and the ball: no one further away changes a score.
    nMate = 0;
    for (let k = o + 1; k < o + 11; k++) {
      if (k === i || !m.on[k]) continue;
      const tx = m.tx[k], ty = m.ty[k];
      if (tx >= x0 - SU.crowdWithin && tx <= x1 + SU.crowdWithin && ty >= y0 - SU.crowdWithin && ty <= y1 + SU.crowdWithin) MATE[nMate++] = k;
    }
    if (b.x < x0) x0 = b.x;
    if (b.x > x1) x1 = b.x;
    if (b.y < y0) y0 = b.y;
    if (b.y > y1) y1 = b.y;
    nOpp = 0;
    for (let j = (1 - side) * 11; j < (1 - side) * 11 + 11; j++) {
      if (!m.on[j]) continue;
      const px = m.px[j], py = m.py[j];
      if (px >= x0 - OPP_R && px <= x1 + OPP_R && py >= y0 - OPP_R && py <= y1 + OPP_R) OPP[nOpp++] = j;
    }
    let bestX = curX, bestY = curY, best = -Infinity;
    for (let k = -2; k < DIRS; k = k < 0 ? k + 1 : k + dirStep) {
      const x = CX[k + 2], y = CY[k + 2];
      let v = openScore(m, side, x, y, b.x, b.y, sx, sy, reach, base) + noise * (m.rng.next() - 0.5);
      if (k === -2) v += SU.keep;
      if (v > best) { best = v; bestX = x - sx; bestY = y - sy; }
    }
    const mx = bestX - curX, my = bestY - curY;
    if (mx * mx + my * my > SU.burstOver * SU.burstOver) at.supBurst[i] = now + SU.burstS * 1000;
    at.supX[i] = bestX;
    at.supY[i] = bestY;
  }
}

/** Where player i in his shape is heading on the ball: his shape spot plus his open spot, kept onside. */
export function supportPoint(m: SpatialMatch, i: number, out: Float64Array): void {
  const side = sideOf(i);
  const team = m.teams[side];
  let x = clamp(m.sx[i] + m.attack.supX[i], 1, LENGTH - 1);
  const y = clamp(m.sy[i] + m.attack.supY[i], T.touchlineMargin, WIDTH - T.touchlineMargin);
  let lim = currentOffCap(team, m.steps);
  if (team.isBehind[i - side * 11]) { const bc = currentBehindCap(team, m.steps); if (bc < lim) lim = bc; }
  if (depthOf(side, x) > lim && m.attack.supX[i] !== 0) x = depthOf(side, Math.max(lim, depthOf(side, m.sx[i])));
  out[0] = x;
  out[1] = y;
}
