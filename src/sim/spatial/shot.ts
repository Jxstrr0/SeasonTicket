/**
 * Shots for the spatial engine (Stage 4.5 build step 4, docs/DESIGN.md 17.3 and 17.5).
 *
 * xG guides the shooter's choice and the stats; it never rolls a goal. A goal comes from the
 * physics: the shot's flight is planned in full when it is struck, one sample per ball
 * substep, and the blockers and the keeper are each given a chance to reach it on that path.
 * The engine then plays the samples back, so what was planned is exactly what happens.
 *
 * Penalties and direct free kicks (step 5) are shots too, with their own aim, error and xG; a
 * free kick may hit the wall. A defender's own-goal deflection is planned the same way, as if
 * the attackers had struck it, but it is nobody's shot.
 *
 * Same rules as the rest of the engine: random draws only through m.rng, no allocations in
 * the step, and only + - * /, Math.sqrt and the det.ts helpers.
 */
import { SPATIAL_TUNING } from '../data';
import { flightSubstep } from './ball';
import { detAtan, detAtan2, detCos, detExp, detSin } from './det';
import { played, wallSlot } from './rules';
import {
  ATTRS, A_CMP, A_FIN, A_GKP, A_HEA, A_REF, A_SPK, A_STR, BALL_AIR, BALL_ROLL, KICK_SHOT, LENGTH, N, SHOT_KIND_FREE_KICK,
  SHOT_KIND_HEADER, SHOT_KIND_OPEN, SHOT_KIND_PENALTY, SHOT_VALUES, WIDTH, acrossOf, clamp, depthOf, sideOf,
  type SpatialMatch,
} from './state';
import type { ShotOutcome, ShotRecord, Side } from './types';

const T = SPATIAL_TUNING;
const SH = T.shot;
const KS = T.keeperSave;
const B = T.ball;
const PT = T.pitch;
const HW = PT.goalWidth / 2;
const GC = PT.goalCentreAcross;
const R = PT.ballRadius;
const PEN = T.penalty;
const FK = T.freeKick;
const OG = T.ownGoal;
const C = T.control;
const XD = Float64Array.from(SH.xgDist);
const XV = Float64Array.from(SH.xgVal);
const FXD = Float64Array.from(FK.xgDist);
const FXV = Float64Array.from(FK.xgVal);

// Options for the next planShot, set by the caller and reset after: a player who cannot block
// it (the deflecting defender), seconds added to the keeper's reaction, metres the keeper has
// leant across (a penalty guess), whether the wall stands aside from the blockers, and
// whether the wall gets it (a free kick that hits the wall).
const PO = new Float64Array(5);
const PO_SKIP = 0, PO_REACT = 1, PO_LEAN = 2, PO_WALL = 3, PO_WALL_HIT = 4;
PO[PO_SKIP] = -1;

/** Outcomes, settled at the strike. */
export const SHOT_GOAL = 0;
export const SHOT_SAVED = 1;
export const SHOT_BLOCKED = 2;
export const SHOT_OFF = 3;
export const SHOT_POST = 4;

/** Where a ball crossing a goal line went (classifyCross). */
export const CROSS_NONE = -1;
export const CROSS_GOAL = 0;
export const CROSS_WOODWORK = 1;
export const CROSS_OUT = 2;

// ---------------------------------------------------------------------------
// Expected goals
// ---------------------------------------------------------------------------

/** An xG curve's value at d metres from the goal centre, straight on. */
function xgCurve(xd: Float64Array, xv: Float64Array, d: number): number {
  const n = xd.length;
  if (d <= xd[0]) return xv[0];
  if (d >= xd[n - 1]) return xv[n - 1];
  let k = 1;
  while (xd[k] < d) k++;
  const f = (d - xd[k - 1]) / (xd[k] - xd[k - 1]);
  return xv[k - 1] + f * (xv[k] - xv[k - 1]);
}

/**
 * How much of the goal a shooter g metres out from the goal line and e metres across from
 * its centre can see, against standing straight on at the same distance (0..1).
 */
export function goalShare(g: number, e: number): number {
  if (g <= 0) return 0;
  const seen = detAtan2(HW - e, g) - detAtan2(-HW - e, g);
  const d = Math.sqrt(g * g + e * e);
  const straight = 2 * detAtan(HW / d);
  const s = seen / straight;
  return s > 1 ? 1 : s < 0 ? 0 : s;
}

/** Expected goals for `side` shooting from (x, y). */
export function xgFrom(side: Side, x: number, y: number, header: boolean, close: boolean): number {
  const g = LENGTH - depthOf(side, x);
  const e = acrossOf(side, y) - GC;
  let v = xgCurve(XD, XV, Math.sqrt(g * g + e * e)) * goalShare(g, e);
  if (header) v *= SH.headerMul;
  if (close) v *= SH.closeMul;
  return v;
}

/** Expected goals of a direct free kick by `side` from (x, y), by a taker with set pieces spk. */
export function fkXg(side: Side, x: number, y: number, spk: number): number {
  const g = LENGTH - depthOf(side, x);
  const e = acrossOf(side, y) - GC;
  return xgCurve(FXD, FXV, Math.sqrt(g * g + e * e)) * (FK.spkBase + spk / 100) * goalShare(g, e);
}

/** The lowest xG worth shooting at: lower in the box, for good finishers and attacking sides. */
export function shotBar(inBox: boolean, fin: number, mentality: number): number {
  if (fin >= SH.barLowFin || mentality >= SH.barLowMentality) return SH.barLow;
  return inBox ? SH.barBox : SH.barOut;
}

/**
 * A quick guess at the chance that an outfield opponent blocks a shot from (bx, by) at the
 * goal centre: anyone standing near the line of it, more so the nearer he is to it.
 */
export function blockEstimate(m: SpatialMatch, side: Side, bx: number, by: number): number {
  const gx = side === 0 ? LENGTH : 0;
  const dx = gx - bx, dy = GC - by;
  const L = Math.sqrt(dx * dx + dy * dy);
  if (L < 1e-9) return 0;
  const ux = dx / L, uy = dy / L;
  const o = (1 - side) * 11;
  let miss = 1;
  for (let k = o + 1; k < o + 11; k++) {
    if (!m.on[k]) continue;
    const rx = m.px[k] - bx, ry = m.py[k] - by;
    const s = rx * ux + ry * uy;
    if (s <= 0 || s >= L) continue;
    let e = rx * uy - ry * ux;
    if (e < 0) e = -e;
    if (e >= SH.laneR) continue;
    miss *= 1 - SH.blockEst * (1 - e / SH.laneR);
  }
  return 1 - miss;
}

// ---------------------------------------------------------------------------
// The goal line
// ---------------------------------------------------------------------------

/**
 * If the ball's move from (xa, ya, za) to (xb, yb, zb) crosses a goal line, where it crossed
 * (out[0] = the line's x, out[1] = y, out[2] = height) and whether it went in, hit the
 * woodwork or went out. The engine and the shot plan both use this, so they always agree.
 */
export function classifyCross(xa: number, ya: number, za: number, xb: number, yb: number, zb: number, out: Float64Array): number {
  let line: number;
  if (xb > LENGTH && xa <= LENGTH) line = LENGTH;
  else if (xb < 0 && xa >= 0) line = 0;
  else return CROSS_NONE;
  const f = (line - xa) / (xb - xa);
  const yc = ya + f * (yb - ya);
  const zc = za + f * (zb - za);
  out[0] = line;
  out[1] = yc;
  out[2] = zc;
  const off = yc < GC ? GC - yc : yc - GC;
  if (off <= HW - R && zc <= PT.goalHeight - R) return CROSS_GOAL;
  if (off < HW + R && zc < PT.goalHeight + R) return CROSS_WOODWORK;
  return CROSS_OUT;
}

// ---------------------------------------------------------------------------
// The shot plan
// ---------------------------------------------------------------------------

const S6 = new Float64Array(6);
/** Where the last planned shot was going (CROSS_*), whatever touched it on the way. */
export const PLAN_WHERE = new Int32Array(1);
const XC = new Float64Array(3);
// Candidates to touch the shot (blockers, then the keeper last): who, at which sample, and how likely.
const cWho = new Int32Array(12);
const cK = new Int32Array(12);
const cU = new Float64Array(12);
const cP = new Float64Array(12);
const cOrder = new Int32Array(12);

// The strike point, and the point found by nearestOnMove.
const P0 = new Float64Array(3);
const SEG = new Float64Array(3);

/**
 * The point of move s of the shot path (from sample s - 1, or the strike point, to sample s)
 * nearest (px, py) across the ground, no further along than umax: its fraction along the
 * move is returned and the point goes in SEG. Samples are a ball substep apart, metres apart
 * for a struck ball, so touches are judged on the moves between them.
 */
function nearestOnMove(path: Float64Array, s: number, px: number, py: number, umax: number): number {
  let ax: number, ay: number, az: number;
  if (s === 1) { ax = P0[0]; ay = P0[1]; az = P0[2]; }
  else { const o = (s - 2) * SHOT_VALUES; ax = path[o]; ay = path[o + 1]; az = path[o + 2]; }
  const o = (s - 1) * SHOT_VALUES;
  const dx = path[o] - ax, dy = path[o + 1] - ay;
  const L2 = dx * dx + dy * dy;
  let u = L2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  if (u < 0) u = 0; else if (u > umax) u = umax;
  SEG[0] = ax + u * dx;
  SEG[1] = ay + u * dy;
  SEG[2] = az + u * (path[o + 2] - az);
  return u;
}

/**
 * Fly a shot struck by `side` from (x0, y0, z0) at (vx, vy, vz) and settle it: fills the
 * match's shot path and planned contact (OnBallState.shot*) and returns the outcome (SHOT_*).
 */
export function planShot(m: SpatialMatch, side: Side, x0: number, y0: number, z0: number, vx: number, vy: number, vz: number): number {
  const ob = m.onball;
  const path = ob.shotPath;
  const h = m.subH;
  const max = Math.min(SH.maxSamples, Math.floor(path.length / SHOT_VALUES));
  S6[0] = x0; S6[1] = y0; S6[2] = z0; S6[3] = vx; S6[4] = vy; S6[5] = vz;
  let state = z0 > 0 || vz > 0 ? BALL_AIR : BALL_ROLL;
  let n = 0, cross = 0, where = CROSS_NONE, crossT = 0;
  for (let k = 1; k <= max; k++) {
    const xa = S6[0], ya = S6[1], za = S6[2];
    if (state === BALL_AIR) {
      flightSubstep(S6, h);
      if (S6[2] <= 0) {
        // Landing, as the engine's flight does: stop on the ground, then bounce or roll.
        const f = za / (za - S6[2]);
        S6[0] = xa + f * (S6[0] - xa);
        S6[1] = ya + f * (S6[1] - ya);
        S6[2] = 0;
        const vzN = S6[5];
        if (-vzN < B.rollBelowVz) { S6[5] = 0; state = BALL_ROLL; }
        else { S6[3] *= B.bounceForward; S6[4] *= B.bounceForward; S6[5] = -vzN * B.bounceVertical; }
      }
    } else {
      const sp = Math.sqrt(S6[3] * S6[3] + S6[4] * S6[4]);
      if (sp > 0) {
        const ns = Math.max(0, sp - B.rollDecel * h);
        const adv = ns > 0 ? ((sp + ns) / 2) * h : (sp * sp) / (2 * B.rollDecel);
        const ux = S6[3] / sp, uy = S6[4] / sp;
        S6[0] += ux * adv; S6[1] += uy * adv;
        S6[3] = ux * ns; S6[4] = uy * ns;
      }
    }
    if (S6[1] < 0) { S6[1] = 0; if (S6[4] < 0) S6[4] = 0; } else if (S6[1] > WIDTH) { S6[1] = WIDTH; if (S6[4] > 0) S6[4] = 0; }
    const o = (k - 1) * SHOT_VALUES;
    path[o] = S6[0]; path[o + 1] = S6[1]; path[o + 2] = S6[2];
    path[o + 3] = S6[3]; path[o + 4] = S6[4]; path[o + 5] = S6[5]; path[o + 6] = state;
    n = k;
    where = classifyCross(xa, ya, za, S6[0], S6[1], S6[2], XC);
    if (where !== CROSS_NONE) {
      cross = k;
      const dx = S6[0] - xa;
      crossT = (k - 1 + (dx !== 0 ? (XC[0] - xa) / dx : 1)) * h;
      break;
    }
    if (state === BALL_ROLL && S6[3] * S6[3] + S6[4] * S6[4] < 0.25) break;
  }
  PLAN_WHERE[0] = where;
  // Moves 1..last can be touched; the one across the line only up to the line.
  const last = cross > 0 ? cross : n;
  const fc = cross > 0 ? (crossT / h) - (cross - 1) : 1;
  P0[0] = x0; P0[1] = y0; P0[2] = z0;
  let nc = 0;
  // Blockers: outfield opponents who can get a body or a leg to it in time.
  const o0 = (1 - side) * 11;
  const rMax = SH.blockR0 + SH.blockGrow + SH.blockSoft;
  for (let q = 1; q < 11; q++) {
    const j = o0 + q;
    if (!m.on[j] || j === PO[PO_SKIP] || (PO[PO_WALL] > 0 && wallSlot(m, j) >= 0)) continue;
    const jx = m.px[j], jy = m.py[j];
    let best = -Infinity, bk = 0, bu = 0;
    for (let s = 1; s <= last; s++) {
      const u = nearestOnMove(path, s, jx, jy, s === cross ? fc : 1);
      if (SEG[2] >= SH.blockHeight) continue;
      const ex = SEG[0] - jx, ey = SEG[1] - jy;
      const e2 = ex * ex + ey * ey;
      if (e2 > rMax * rMax) continue;
      // He sees the shot coming from the shooter's back-lift, before the ball is struck.
      const r = SH.blockR0 + SH.blockGrow * clamp(((s - 1 + u) * h + SH.blockWindup - SH.blockReact) / SH.blockT, 0, 1);
      const mg = r - Math.sqrt(e2);
      if (mg > best) { best = mg; bk = s; bu = u; }
    }
    const p = bk > 0 ? clamp(0.5 + best / SH.blockSoft, 0, SH.blockMax) : 0;
    if (p > 0) { cWho[nc] = j; cK[nc] = bk; cU[nc] = bu; cP[nc] = p; nc++; }
  }
  // A free kick that hits the wall: it gets there, a wall's distance from the ball.
  if (PO[PO_WALL_HIT] > 0 && m.rules.nWall > 0) {
    const wd2 = FK.wallDist * FK.wallDist;
    for (let s = 1; s <= last; s++) {
      const o = (s - 1) * SHOT_VALUES;
      const ex = path[o] - x0, ey = path[o + 1] - y0;
      if (ex * ex + ey * ey >= wd2) { cWho[nc] = m.rules.wall[0]; cK[nc] = s; cU[nc] = 0.5; cP[nc] = 1; nc++; break; }
    }
  }
  // The keeper goes for anything heading for the goal frame.
  const onTarget = where === CROSS_GOAL;
  const post = where === CROSS_WOODWORK;
  if (onTarget || post) {
    const kp = o0;
    const at = ob.attr;
    const react = KS.reactBase - (KS.reactRef * at[kp * ATTRS + A_REF]) / 99 + PO[PO_REACT];
    const base = KS.reach0 + (KS.gkpBonus * at[kp * ATTRS + A_GKP]) / 99;
    const kx = m.px[kp], ky = m.py[kp] + PO[PO_LEAN];
    let best = -Infinity, bk = 0, bu = 0;
    for (let s = 1; s <= last; s++) {
      const u = nearestOnMove(path, s, kx, ky, s === cross ? fc : 1);
      const dx = SEG[0] - kx, dy = SEG[1] - ky;
      const up = SEG[2] > KS.standHigh ? SEG[2] - KS.standHigh : 0;
      const e = Math.sqrt(dx * dx + dy * dy + up * up);
      const r = base + KS.diveV * clamp((s - 1 + u) * h - react, 0, KS.diveT);
      const mg = r - e;
      if (mg > best) { best = mg; bk = s; bu = u; }
    }
    const p = clamp(0.5 + best / KS.soft, 0, KS.max);
    if (p > 0 && bk > 0) { cWho[nc] = kp; cK[nc] = bk; cU[nc] = bu; cP[nc] = p; nc++; }
  }
  // Whoever the ball reaches first and wins his roll touches it.
  for (let a = 0; a < nc; a++) {
    let r = a;
    const ta = cK[a] + cU[a];
    while (r > 0 && cK[cOrder[r - 1]] + cU[cOrder[r - 1]] > ta) { cOrder[r] = cOrder[r - 1]; r--; }
    cOrder[r] = a;
  }
  ob.shotEventK = 0;
  ob.shotEventU = 0;
  ob.shotEventKind = 0;
  ob.shotEventPlayer = -1;
  for (let r = 0; r < nc; r++) {
    const c = cOrder[r];
    if (m.rng.chance(cP[c])) {
      ob.shotEventK = cK[c];
      ob.shotEventU = cU[c];
      ob.shotEventPlayer = cWho[c];
      ob.shotEventKind = cWho[c] === o0 ? 2 : 1;
      break;
    }
  }
  ob.shotN = ob.shotEventK > 0 ? ob.shotEventK : n;
  ob.shotK = 0;
  if (ob.shotEventKind === 1) return SHOT_BLOCKED;
  if (ob.shotEventKind === 2) return SHOT_SAVED;
  return onTarget ? SHOT_GOAL : post ? SHOT_POST : SHOT_OFF;
}

// ---------------------------------------------------------------------------
// The strike
// ---------------------------------------------------------------------------

const OUTCOME: readonly ShotOutcome[] = ['goal', 'saved', 'blocked', 'off', 'post'];
const SIM = new Float64Array(6);

/** In the penalty area that `side` attacks. */
export function inAttackBox(side: Side, x: number, y: number): boolean {
  const off = y < GC ? GC - y : y - GC;
  return depthOf(side, x) > LENGTH - PT.boxDepth && off < PT.boxHalfWidth;
}

/** Distance from (x, y) to the nearest opponent of `side`. */
function nearestOpponent(m: SpatialMatch, side: Side, x: number, y: number): number {
  const o = (1 - side) * 11;
  let best = Infinity;
  for (let k = o; k < o + 11; k++) {
    if (!m.on[k]) continue;
    const dx = m.px[k] - x, dy = m.py[k] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/** xG of a shot by `side` from the ball's spot right now (with a defender close by or not). */
export function xgHere(m: SpatialMatch, side: Side, header: boolean): number {
  const b = m.ball;
  return xgFrom(side, b.x, b.y, header, nearestOpponent(m, side, b.x, b.y) <= SH.closeWithin);
}

/**
 * Player i of `side` shoots (kind SHOT_KIND_*; a header from the ball's height). He picks a
 * corner away from the keeper (a penalty taker picks one at random), misses it by an error
 * that grows with poor finishing and pressure, and the whole flight is planned there and then
 * (planShot).
 */
export function shoot(m: SpatialMatch, i: number, side: Side, kind: number): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  const at = ob.attr;
  const o = i * ATTRS;
  const header = kind === SHOT_KIND_HEADER;
  const pen = kind === SHOT_KIND_PENALTY;
  const fk = kind === SHOT_KIND_FREE_KICK;
  const skill = header ? at[o + A_HEA] : pen ? (at[o + A_SPK] + at[o + A_CMP]) / 2 : fk ? at[o + A_SPK] : at[o + A_FIN];
  const x0 = b.x, y0 = b.y;
  const z0 = header ? b.z : R;
  const gx = side === 0 ? LENGTH : 0;
  // Where the keeper covers on the goal line, seen from the ball; aim for the bigger side.
  const kp = (1 - side) * 11;
  const kdx = m.px[kp] - x0, gdx = gx - x0;
  let proj = m.py[kp];
  if (kdx * gdx > 0 && (kdx > 0.1 || kdx < -0.1)) proj = y0 + ((m.py[kp] - y0) * gdx) / kdx;
  const lo = GC - HW, hi = GC + HW;
  const pc = clamp(proj, lo, hi);
  let ty: number;
  if (pen) {
    const inset = m.rng.float(PEN.inset[0], PEN.inset[1]);
    ty = m.rng.chance(0.5) ? lo + inset : hi - inset;
  } else {
    const inset = m.rng.float(SH.postInset[0], SH.postInset[1]);
    ty = pc - lo >= hi - pc ? lo + inset : hi - inset;
  }
  let tz = header ? SH.headZ : m.rng.chance(pen ? PEN.highShare : fk ? FK.highShare : SH.highShare) ? SH.highZ : SH.lowZ;
  // Aiming error: an angle across, and a height error in proportion.
  const close = nearestOpponent(m, side, x0, y0);
  let sdA: number;
  if (pen) sdA = PEN.err + PEN.errSpk * (1 - skill / 99);
  else if (fk) sdA = FK.err + FK.errSpk * (1 - skill / 99);
  else {
    const pressF = clamp(1 - close / SH.pressureWithin, 0, 1);
    sdA = (SH.errBase + SH.errFin * (1 - skill / 99)) * (1 + pressF * (SH.errPress0 + SH.errPressure * (1 - at[o + A_CMP] / 99)));
    if (header) sdA *= SH.errHeader;
  }
  const dx = gx - x0, dy = ty - y0;
  const Dg = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
  const th = m.rng.normalDet(0, sdA);
  const c = detCos(th), sn = detSin(th);
  const ux = (dx / Dg) * c - (dy / Dg) * sn;
  const uy = (dx / Dg) * sn + (dy / Dg) * c;
  tz += m.rng.normalDet(0, SH.errVertical * sdA * Dg);
  if (tz < 0) tz = 0;
  // Pace from technique and strength; heading from heading.
  const v = header
    ? SH.headSpeed[0] + ((SH.headSpeed[1] - SH.headSpeed[0]) * at[o + A_HEA]) / 99
    : pen ? PEN.speed[0] + ((PEN.speed[1] - PEN.speed[0]) * skill) / 99
      : fk ? FK.speed[0] + ((FK.speed[1] - FK.speed[0]) * skill) / 99
        : SH.speed[0] + ((SH.speed[1] - SH.speed[0]) * (0.6 * at[o + A_FIN] + 0.4 * at[o + A_STR])) / 99;
  // Rise to reach height tz at the goal line: drag slows it, so time it with drag, then
  // correct once by flying it.
  const k = B.drag;
  const t = (detExp(k * Dg) - 1) / (k * v);
  let vz = (tz - z0 + (B.gravity * t * t) / 2) / t;
  SIM[0] = 0; SIM[1] = 0; SIM[2] = z0; SIM[3] = v; SIM[4] = 0; SIM[5] = vz;
  let zPrev = z0, xPrev = 0, zAt = tz;
  for (let s = 0; s < 400; s++) {
    flightSubstep(SIM, m.subH);
    if (SIM[0] >= Dg) { zAt = zPrev + ((SIM[2] - zPrev) * (Dg - xPrev)) / (SIM[0] - xPrev); break; }
    zPrev = SIM[2]; xPrev = SIM[0];
  }
  vz += (tz - zAt) / t;
  const vx = ux * v, vy = uy * v;
  const xg = pen ? PEN.xg : fk ? fkXg(side, x0, y0, at[o + A_SPK]) : xgFrom(side, x0, y0, header, close <= SH.closeWithin);
  if (pen) {
    // The keeper picks a side and leans that way, and is quicker off his line.
    if (m.rng.chance(PEN.guess)) PO[PO_LEAN] = m.rng.chance(0.5) ? PEN.lean : -PEN.lean;
    PO[PO_REACT] = PEN.reactAdd;
  } else if (fk && m.rules.nWall > 0) {
    // Over or round the wall, or into it; if it beats the wall the keeper sees it late.
    PO[PO_WALL] = 1;
    if (m.rng.chance(FK.wallHit - (FK.wallHitSpk * at[o + A_SPK]) / 99)) PO[PO_WALL_HIT] = 1;
    else PO[PO_REACT] = FK.keeperReact;
  }
  const outcome = planShot(m, side, x0, y0, z0, vx, vy, vz);
  PO[PO_SKIP] = -1; PO[PO_REACT] = 0; PO[PO_LEAN] = 0; PO[PO_WALL] = 0; PO[PO_WALL_HIT] = 0;
  // The ball is off.
  b.state = z0 > 0 || vz > 0 ? BALL_AIR : BALL_ROLL;
  b.owner = -1;
  b.receiver = -1;
  b.z = z0;
  b.vx = vx; b.vy = vy; b.vz = vz;
  b.strikeMs = now;
  ob.passTarget = -1;
  ob.passKind = KICK_SHOT;
  ob.passCross = false;
  ob.lastPasser = i;
  ob.passSide = side;
  ob.pressured = false;
  ob.chase[0] = -1;
  ob.chase[1] = -1;
  ob.lastKick = i;
  ob.shooter = i;
  ob.shotXg = xg;
  ob.shotHeader = header;
  ob.shotAssist = ob.lastRecv === i ? ob.lastRecvFrom : -1;
  ob.shots[side]++;
  ob.xg[side] += xg;
  if (inAttackBox(side, x0, y0)) ob.shotsInBox[side]++;
  if (outcome === SHOT_GOAL || (outcome === SHOT_SAVED && PLAN_WHERE[0] === CROSS_GOAL)) ob.onTarget[side]++;
  if (outcome === SHOT_BLOCKED) ob.blocked[side]++;
  if (outcome === SHOT_POST) ob.woodwork[side]++;
  m.rules.shotKind = kind;
  if (fk) m.rules.fkShots[side]++;
  const rec: ShotRecord = { ms: now, side, player: m.who[i], x: x0, y: y0, xg, header, outcome: OUTCOME[outcome] };
  if (pen) rec.setPiece = 'penalty';
  else if (fk) rec.setPiece = 'freeKick';
  m.shotLog.push(rec);
  for (let j = 0; j < N; j++) m.nextThink[j] = now;
  played(m, i);
}

/**
 * Defender i turns the other side's ball towards his own goal. It is planned like a shot by
 * the attackers (the keeper sees it late, the defender cannot block his own), but it is
 * nobody's shot: in, it is his own goal.
 */
export function deflect(m: SpatialMatch, i: number): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  const side = sideOf(i);
  const att = (1 - side) as Side;
  const dx = (side === 0 ? 0 : LENGTH) - b.x, dy = GC - b.y;
  const D = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
  const th = m.rng.normalDet(0, OG.spread);
  const c = detCos(th), sn = detSin(th);
  const ux = (dx / D) * c - (dy / D) * sn;
  const uy = (dx / D) * sn + (dy / D) * c;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  const v = sp * m.rng.float(OG.speed[0], OG.speed[1]);
  const vx = ux * v, vy = uy * v;
  PO[PO_SKIP] = i;
  PO[PO_REACT] = OG.react;
  planShot(m, att, b.x, b.y, b.z, vx, vy, 0);
  PO[PO_SKIP] = -1; PO[PO_REACT] = 0;
  b.state = b.z > 0 ? BALL_AIR : BALL_ROLL;
  b.owner = -1;
  b.receiver = -1;
  b.vx = vx; b.vy = vy; b.vz = 0;
  b.strikeMs = now;
  ob.passTarget = -1;
  ob.passKind = KICK_SHOT;
  ob.passCross = false;
  ob.passSide = att;
  ob.pressured = false;
  ob.chase[0] = -1;
  ob.chase[1] = -1;
  ob.lastKick = i;
  ob.lastTouch = i;
  ob.touchAt = now;
  ob.touchBlock[i] = now + C.retouchMs;
  ob.shooter = -1;
  ob.shotXg = 0;
  ob.shotHeader = false;
  ob.shotAssist = -1;
  m.rules.shotKind = SHOT_KIND_OPEN;
  for (let j = 0; j < N; j++) m.nextThink[j] = now;
}
