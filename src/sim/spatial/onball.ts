/**
 * On-ball play for the spatial engine (Stage 4.5 build step 3): the carrier's decisions
 * (pass, carry, hold or clear), the strike and its error, interceptions, first touches,
 * loose balls and tackles, and the match stats they produce.
 *
 * Every option gets a success chance p worked out from where everyone is and how fast they
 * can get somewhere, and a value read from the threat grid (the chance that having the ball
 * on a spot ends in a goal). The carrier takes the best score after a little noise that
 * shrinks with vision, composure and positioning (docs/DESIGN.md section 17.15).
 *
 * Same rules as the rest of the engine: random draws only through m.rng, no allocations in
 * the step (all scratch is preallocated here), and only + - * /, Math.sqrt and the det.ts
 * helpers, so every browser plays the same match.
 */
import { SPATIAL_TUNING } from '../data';
import { LOFT_COS, LOFT_SIN, groundInto, loftInto } from './ball';
import { PI, detCos, detSin, sCurve } from './det';
import { secondLastOpponent } from './shape';
import {
  BALL_AIR, BALL_FROZEN, BALL_HELD, BALL_ROLL, LENGTH, N, WIDTH,
  acrossOf, clamp, depthOf, sideOf, type OnBallState, type SpatialMatch,
} from './state';
import type { Side } from './types';

const T = SPATIAL_TUNING;
const B = T.ball;
const DC = T.decision;
const P = T.pass;
const C = T.control;
const CA = T.carry;
const TK = T.tackle;
const DU = T.duel;
const CL = T.clearance;
const CH = T.chase;
const SI = T.standIn;
const V = T.vision;
const TH = T.threat;
const KP = T.keeper;

// Attribute cache: ATTRS values per player in OnBallState.attr.
const A_PAS = 0, A_VIS = 1, A_CMP = 2, A_POS = 3, A_DRI = 4, A_STR = 5, A_TCK = 6, A_HEA = 7, A_KCK = 8, A_PAC = 9, A_AGG = 10;
export const ATTRS = 11;

const GRID = Float64Array.from(TH.grid);
const COLS = TH.cols;
const ROWS = GRID.length / COLS;
const CELL_A = WIDTH / COLS;

const LANE_NORM = sCurve(P.steep * (P.lateCut - P.centre));
const LOFT_NORM = sCurve(P.loftSteep * (P.lateCut - P.centre));
const GRACE_S = P.graceMs / 1000;
const CARRY_COS = Float64Array.from(CA.angles, (d) => detCos((d * PI) / 180));
const CARRY_SIN = Float64Array.from(CA.angles, (d) => detSin((d * PI) / 180));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createOnBall(): OnBallState {
  const scanAt = new Float64Array(N);
  scanAt.fill(-1e9);
  return {
    carryX: 0, carryY: 0,
    decideAt: 0, readyAt: 0,
    holdUntil: 0, pressured: false,
    lastPasser: -1, passSide: 0, passKind: 0,
    passTarget: -1, aimX: 0, aimY: 0,
    passArriveMs: 0,
    lastTouch: -1, touchAt: -1e9,
    touchBlock: new Float64Array(N),
    chase: Int32Array.of(-1, -1), chaseX: new Float64Array(2), chaseY: new Float64Array(2), chaseAt: 0,
    tackleReady: new Float64Array(N), scanAt, nextScan: new Float64Array(N), scanMs: new Float64Array(N),
    faceX: new Float64Array(N), faceY: new Float64Array(N),
    attr: new Float64Array(N * ATTRS),
    possMs: new Float64Array(2), passes: new Int32Array(2), completed: new Int32Array(2),
    intercepted: new Int32Array(2), tackles: new Int32Array(2), boxEntries: new Int32Array(2),
    shots: new Int32Array(2), entered: false,
  };
}

/** Cache attributes, stagger the scans and face everyone up the pitch. Call before kick-off. */
export function initOnBall(m: SpatialMatch): void {
  const ob = m.onball;
  const sides = [m.setup.home, m.setup.away];
  const slow = V.scanEvery[1], gain = V.scanEvery[1] - V.scanEvery[0];
  for (let i = 0; i < N; i++) {
    const a = sides[sideOf(i)].players[i % 11].attributes;
    const o = i * ATTRS;
    ob.attr[o + A_PAS] = a.pas;
    ob.attr[o + A_VIS] = a.vis;
    ob.attr[o + A_CMP] = a.cmp;
    ob.attr[o + A_POS] = a.pos;
    ob.attr[o + A_DRI] = a.dri;
    ob.attr[o + A_STR] = a.str;
    ob.attr[o + A_TCK] = a.tck;
    ob.attr[o + A_HEA] = a.hea;
    ob.attr[o + A_KCK] = a.kck;
    ob.attr[o + A_PAC] = a.pac;
    ob.attr[o + A_AGG] = a.agg;
    ob.scanMs[i] = Math.round((slow - (gain * a.vis) / 99) * 1000);
    ob.nextScan[i] = Math.round(m.rng.next() * ob.scanMs[i]);
    ob.scanAt[i] = -1e9;
    ob.faceX[i] = sideOf(i) === 0 ? 1 : -1;
    ob.faceY[i] = 0;
    ob.tackleReady[i] = 0;
    ob.touchBlock[i] = 0;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Threat of having the ball at (x, y) for `side`, by bilinear interpolation of the grid. */
export function threatAt(side: Side, x: number, y: number): number {
  const r = clamp((depthOf(side, x) - TH.cell / 2) / TH.cell, 0, ROWS - 1);
  const c = clamp(acrossOf(side, y) / CELL_A - 0.5, 0, COLS - 1);
  const r0 = Math.floor(r), c0 = Math.floor(c);
  const r1 = r0 < ROWS - 1 ? r0 + 1 : r0;
  const c1 = c0 < COLS - 1 ? c0 + 1 : c0;
  const fr = r - r0, fc = c - c0;
  const g00 = GRID[r0 * COLS + c0], g01 = GRID[r0 * COLS + c1];
  const g10 = GRID[r1 * COLS + c0], g11 = GRID[r1 * COLS + c1];
  const lo = g00 + (g01 - g00) * fc;
  const hi = g10 + (g11 - g10) * fc;
  return lo + (hi - lo) * fr;
}

/** Closest distance from point (px, py) to the segment (ax, ay)-(bx, by). */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const sx = bx - ax;
  const sy = by - ay;
  const L2 = sx * sx + sy * sy;
  let f = L2 > 1e-12 ? ((px - ax) * sx + (py - ay) * sy) / L2 : 0;
  f = clamp(f, 0, 1);
  const dx = px - (ax + f * sx);
  const dy = py - (ay + f * sy);
  return Math.sqrt(dx * dx + dy * dy);
}

/** In the penalty area that `side` attacks. The box is symmetric across, so y works as is. */
function inAttackBox(side: Side, x: number, y: number): boolean {
  return depthOf(side, x) > SI.boxDepth && y > SI.acrossMin && y < SI.acrossMax;
}

function inOwnBox(side: Side, x: number, y: number): boolean {
  return depthOf(side, x) < LENGTH - SI.boxDepth && y > SI.acrossMin && y < SI.acrossMax;
}

/** Close in and central: where the stand-in shot goes off. */
function inShotZone(side: Side, x: number, y: number): boolean {
  return depthOf(side, x) > SI.shotDepth && y > SI.shotAcrossMin && y < SI.shotAcrossMax;
}

/** How far player i can reach for the ball at (x, y): a keeper in his own box has his hands. */
function handReach(i: number, x: number, y: number): number {
  return i % 11 === 0 && inOwnBox(sideOf(i), x, y) ? B.controlReach + KP.claimReach : B.controlReach;
}

/**
 * Seconds for player i to cover `d - less` metres towards (dx, dy) (|(dx, dy)| = d), from
 * his current velocity: accelerate to top speed, then hold it. Running the other way costs
 * the time it takes to stop first.
 */
function reach(m: SpatialMatch, i: number, dx: number, dy: number, d: number, less: number): number {
  const de = d - less;
  if (de <= 0) return 0;
  const top = m.top[i], acc = m.acc[i];
  let v0 = (m.vx[i] * dx + m.vy[i] * dy) / d;
  let t0 = 0;
  if (v0 < 0) { t0 = -v0 / acc; v0 = 0; } else if (v0 > top) v0 = top;
  const t1 = (top - v0) / acc;
  const d1 = (v0 + top) * 0.5 * t1;
  if (de <= d1) return t0 + (Math.sqrt(v0 * v0 + 2 * acc * de) - v0) / acc;
  return t0 + t1 + (de - d1) / top;
}

function nearestOpponent2(m: SpatialMatch, side: Side, x: number, y: number): number {
  const o = (1 - side) * 11;
  let best = Infinity;
  for (let k = o; k < o + 11; k++) {
    const dx = m.px[k] - x, dy = m.py[k] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Possession and control
// ---------------------------------------------------------------------------

export function setPossession(m: SpatialMatch, side: Side): void {
  if (side === m.poss) return;
  const loser = m.teams[m.poss];
  const winner = m.teams[side];
  const now = m.clockMs;
  m.poss = side;
  m.possChanged = true;
  m.onball.entered = false;
  loser.counterPressUntil = now + T.press.counterPress[loser.tactics.pressing - 1] * 1000;
  loser.counterUntil = 0;
  winner.counterPressUntil = 0;
  winner.counterUntil = winner.tactics.counterAttack ? now + T.counter.seconds * 1000 : 0;
  for (let i = 0; i < N; i++) m.nextThink[i] = now;
}

/** Player i has the ball under control. */
export function control(m: SpatialMatch, i: number): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  if (b.receiver >= 0) m.nextThink[b.receiver] = now;
  if (ob.passTarget >= 0) m.nextThink[ob.passTarget] = now;
  if (ob.chase[0] >= 0) m.nextThink[ob.chase[0]] = now;
  if (ob.chase[1] >= 0) m.nextThink[ob.chase[1]] = now;
  b.state = BALL_HELD;
  b.owner = i;
  b.receiver = -1;
  b.z = 0;
  b.vz = 0;
  const ox = b.x - m.px[i];
  const oy = b.y - m.py[i];
  const r = Math.sqrt(ox * ox + oy * oy);
  if (r > 1e-9) { b.ox = (ox / r) * B.dribbleAhead; b.oy = (oy / r) * B.dribbleAhead; }
  else { b.ox = (sideOf(i) === 0 ? 1 : -1) * B.dribbleAhead; b.oy = 0; }
  m.nextThink[i] = now;
  setPossession(m, sideOf(i));
  startControl(m, i);
}

/** Reset the on-ball state for a new carrier: first touch, then the tempo clock starts. */
export function startControl(m: SpatialMatch, i: number): void {
  const ob = m.onball;
  const now = m.clockMs;
  ob.readyAt = now + DC.touchMs;
  ob.decideAt = ob.readyAt;
  if (i % 11 === 0) ob.holdUntil = now + DC.keeperHold * 1000;
  else {
    const tempo = m.teams[sideOf(i)].tactics.tempo;
    const hold = T.tempoHold[tempo - 1] * (1 + DC.holdJitter * (2 * m.rng.next() - 1));
    ob.holdUntil = now + Math.round(hold * 1000);
  }
  ob.carryX = m.px[i];
  ob.carryY = m.py[i];
  ob.passTarget = -1;
  ob.passKind = 0;
  ob.chase[0] = -1;
  ob.chase[1] = -1;
  ob.pressured = false;
}

// ---------------------------------------------------------------------------
// Pass contest: how likely each opponent is to cut a pass out
// ---------------------------------------------------------------------------

// Results of the last contest() call, per opponent slot.
const cMiss = new Float64Array(11);
const cS = new Float64Array(11);
// Scratch numbers live in a typed array: a module-level `let` holding a fraction makes a new
// heap number on every write, which in the decision loop meant a garbage collection every few
// seconds of match time.
const CV = new Float64Array(12);
const C_PROD = 0, C_LOSS_X = 1, C_LOSS_Y = 2, C_NEAR2 = 3;

/**
 * For a pass from (bx, by) to (ax, ay), D metres along (ux, uy), launched at v0 and arriving
 * after tArr seconds, with the receiver getting to the aim after tr seconds: the chance each
 * opponent misses it (cMiss), where along the path he would cut it out (cS), the product of
 * the misses (CV[C_PROD]), where the ball is most likely lost (CV[C_LOSS_X], CV[C_LOSS_Y]) and the
 * nearest opponent to the aim (CV[C_NEAR2], squared).
 */
function contest(
  m: SpatialMatch, side: Side, bx: number, by: number, ax: number, ay: number,
  D: number, ux: number, uy: number, lofted: boolean, v0: number, tArr: number, tr: number,
): void {
  const o = (1 - side) * 11;
  const a = B.rollDecel;
  const from = lofted ? D - P.loftZone : P.laneFrom;
  const to = lofted ? D - P.loftZoneEnd : D - P.laneEnd;
  const steep = lofted ? P.loftSteep : P.steep;
  const norm = lofted ? LOFT_NORM : LANE_NORM;
  const v02 = v0 * v0;
  const endBudget = tr + P.centre + P.lateCut - P.reaction;
  let prod = 1, worst = 1, lx = ax, ly = ay, near2 = Infinity;
  for (let q = 0; q < 11; q++) {
    const k = o + q;
    const kx = m.px[k], ky = m.py[k];
    const top = m.top[k];
    let miss = 1, s = D;
    // In the lane: can he get to the line of the pass before the ball goes by?
    const rx = kx - bx, ry = ky - by;
    const sl = rx * ux + ry * uy;
    if (sl >= from && sl <= to) {
      let e = rx * uy - ry * ux;
      if (e < 0) e = -e;
      if (e <= P.laneWidth) {
        const tb = lofted ? (tArr * sl) / D : (v0 - Math.sqrt(Math.max(0, v02 - 2 * a * sl))) / a;
        if (P.reaction + (e - P.interceptReach) / top < tb + P.centre + P.lateCut) {
          const tk = P.reaction + reach(m, k, bx + ux * sl - kx, by + uy * sl - ky, e, P.interceptReach);
          let lm = sCurve(steep * (tk - tb - P.centre)) / norm;
          if (lm > 1) lm = 1;
          if (!lofted && e < P.bodyBlock && lm > P.blockMiss) lm = P.blockMiss;
          if (lm < miss) { miss = lm; s = sl; }
        }
      }
    }
    // At the aim: does he get there before the receiver?
    const ex = ax - kx, ey = ay - ky;
    const d2 = ex * ex + ey * ey;
    if (d2 < near2) near2 = d2;
    const kr = q === 0 && inOwnBox((1 - side) as Side, ax, ay) ? P.interceptReach + KP.claimReach : P.interceptReach;
    const lim = kr + top * endBudget;
    if (lim > 0 && d2 < lim * lim) {
      const dk = Math.sqrt(d2);
      const tk = P.reaction + reach(m, k, ex, ey, dk, kr);
      let em = sCurve(P.steep * (tk - tr - P.centre)) / LANE_NORM;
      if (em > 1) em = 1;
      if (em < miss) { miss = em; s = D; }
    }
    cMiss[q] = miss;
    cS[q] = s;
    prod *= miss;
    if (miss < worst) { worst = miss; lx = bx + ux * s; ly = by + uy * s; }
  }
  CV[C_PROD] = prod;
  CV[C_LOSS_X] = lx;
  CV[C_LOSS_Y] = ly;
  CV[C_NEAR2] = near2;
}

/** Launch speed and time for a ground pass; slower ("weighted") into space when the receiver needs longer. */
function groundSpeed(D: number, weightT: number): void {
  groundInto(D, IO);
  if (weightT > IO[1]) {
    const a = B.rollDecel;
    let v = D / weightT + a * weightT * 0.5;
    if (v - a * weightT < P.minArrive) {
      v = Math.sqrt(P.minArrive * P.minArrive + 2 * a * D);
      IO[1] = (v - P.minArrive) / a;
    } else IO[1] = weightT;
    IO[0] = v;
  }
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

const CAP = 128;
const K_FEET = 0, K_SPACE = 1, K_THROUGH = 2, K_CARRY = 3, K_HOLD = 4, K_CLEAR = 5;
const oKind = new Uint8Array(CAP);
const oRecv = new Int32Array(CAP);
const oX = new Float64Array(CAP);
const oY = new Float64Array(CAP);
const oLoft = new Uint8Array(CAP);
const oWeight = new Float64Array(CAP);
const oLen = new Float64Array(CAP);
const oRaw = new Float64Array(CAP);
const oScore = new Float64Array(CAP);
const top5 = new Int32Array(8);
// Per team-mate slot: squared distance to his nearest opponent, or -1 until it is needed.
const near2 = new Float64Array(11);
const blk = new Int32Array(11);
const IO = new Float64Array(2);
let nOpt = 0;
// Per pass option: launch speed, flight time, receiver's time, lateness factor, the most it
// could be worth (oUB) and whether it has been checked against the defence yet.
const oV0 = new Float64Array(CAP);
const oTArr = new Float64Array(CAP);
const oTr = new Float64Array(CAP);
const oLate = new Float64Array(CAP);
const oUB = new Float64Array(CAP);
const oDone = new Uint8Array(CAP);
const byUB = new Int32Array(CAP);
// The best few values seen so far (best first), and how many.
const topV = new Float64Array(8);
let nTop = 0;
// Score scale and tactic nudges for the decision being made: S, directness, tempo, width.
const SC = new Float64Array(4);
let sCounter = false;
let sOverdue = false;
// Slack for rounding when ruling a pass out on its bound.
const EPS = 1e-12;

// The decision being made.
let cSide: Side = 0;
const C_BX = 4, C_BY = 5, C_DEPTH = 6, C_ACROSS = 7, C_LINE = 8, C_RISK = 9, C_LOFT_OVER = 10, C_VIS = 11;
let cAllow = true;

function pushOption(kind: number, recv: number, x: number, y: number, lofted: number, weight: number, len: number, raw: number): void {
  const k = nOpt++;
  oKind[k] = kind;
  oRecv[k] = recv;
  oX[k] = x;
  oY[k] = y;
  oLoft[k] = lofted;
  oWeight[k] = weight;
  oLen[k] = len;
  oRaw[k] = raw;
}

/** How loose the first touch is likely to be: ball speed on arrival, pressure (0..1) and technique. */
function looseOf(m: SpatialMatch, j: number, v0: number, tArr: number, pressF: number): number {
  const arrive = v0 - B.rollDecel * tArr;
  const speedF = clamp((arrive - C.speedFrom) / C.speedSpan, 0, 1);
  const o = j * ATTRS;
  const tech = (m.onball.attr[o + A_DRI] + m.onball.attr[o + A_CMP]) / 198;
  return C.looseMin + (C.looseMax - C.looseMin) * (C.wSpeed * speedF + C.wPressure * pressF + C.wTech * (1 - tech));
}

/** Squared distance from team-mate j to his nearest opponent (worked out once per decision). */
function nearOpp2(m: SpatialMatch, j: number): number {
  const s = j % 11;
  let n2 = near2[s];
  if (n2 >= 0) return n2;
  const o0 = (1 - cSide) * 11;
  const jx = m.px[j], jy = m.py[j];
  n2 = Infinity;
  for (let k = o0; k < o0 + 11; k++) {
    const ex = m.px[k] - jx, ey = m.py[k] - jy;
    const e2 = ex * ex + ey * ey;
    if (e2 < n2) n2 = e2;
  }
  near2[s] = n2;
  return n2;
}

/** List a pass option. It is checked against the defence later, only if it could make the shortlist. */
function addPass(m: SpatialMatch, j: number, ax: number, ay: number, kind: number, lofted: boolean): void {
  if (nOpt >= CAP) return;
  const side = cSide;
  ax = clamp(ax, 0.5, LENGTH - 0.5);
  ay = clamp(ay, 0.5, WIDTH - 0.5);
  const depth = depthOf(side, ax);
  // Until his time on the ball is up, an unpressed carrier only looks for balls in behind.
  if (!cAllow && kind !== K_THROUGH && depth <= CV[C_LINE]) return;
  const dx = ax - CV[C_BX], dy = ay - CV[C_BY];
  const D2 = dx * dx + dy * dy;
  if (D2 < P.minLength * P.minLength || D2 > P.maxLength * P.maxLength) return;
  const D = Math.sqrt(D2);
  if (kind === K_THROUGH && D > V.throughOver && CV[C_VIS] < V.throughMin) return;
  const dA = acrossOf(side, ay) - CV[C_ACROSS];
  if ((dA >= V.switchAcross || dA <= -V.switchAcross) && D > V.switchOver && CV[C_VIS] < V.switchMin) return;
  const rdx = ax - m.px[j], rdy = ay - m.py[j];
  const rd = Math.sqrt(rdx * rdx + rdy * rdy);
  const tr = P.recvReaction + (rd > 1e-9 ? reach(m, j, rdx, rdy, rd, P.interceptReach) : 0);
  let weight = 0;
  if (lofted) loftInto(m.loft, D, IO);
  else {
    weight = kind === K_FEET ? 0 : tr;
    groundSpeed(D, weight);
  }
  const v0 = IO[0], tArr = IO[1];
  const late = tr - tArr;
  const lateF = late > 0 ? Math.max(0, 1 - late / GRACE_S) : 1;
  // The most it could be worth: nobody can cut it out and nobody is near the receiver.
  const ctrlHi = lofted ? P.loftArrive : 1 - P.looseLoss * looseOf(m, j, v0, tArr, 0);
  const back = kind === K_FEET && depth > CV[C_DEPTH] && nearOpp2(m, j) <= TH.pressedWithin * TH.pressedWithin ? TH.recvBack : TH.recvFwd;
  const multHi = depth > CV[C_LINE] && TH.recvBehind > back ? TH.recvBehind : back;
  const k = nOpt;
  pushOption(kind, j, ax, ay, lofted ? 1 : 0, weight, D, -Infinity);
  oV0[k] = v0;
  oTArr[k] = tArr;
  oTr[k] = tr;
  oLate[k] = lateF;
  oUB[k] = ctrlHi * lateF * threatAt(side, ax, ay) * multHi;
  oDone[k] = 0;
}

/** Check pass option k against the defence and work out what it is worth. */
function evalPass(m: SpatialMatch, k: number): void {
  const side = cSide;
  const ax = oX[k], ay = oY[k], D = oLen[k];
  const ux = (ax - CV[C_BX]) / D, uy = (ay - CV[C_BY]) / D;
  const lofted = oLoft[k] === 1;
  const v0 = oV0[k], tArr = oTArr[k];
  contest(m, side, CV[C_BX], CV[C_BY], ax, ay, D, ux, uy, lofted, v0, tArr, oTr[k]);
  const j = oRecv[k];
  const ctrl = lofted
    ? P.loftArrive
    : 1 - P.looseLoss * looseOf(m, j, v0, tArr, clamp(1 - Math.sqrt(CV[C_NEAR2]) / C.pressureWithin, 0, 1));
  const p = CV[C_PROD] * ctrl * oLate[k];
  const depth = depthOf(side, ax);
  let mult = TH.recvFwd;
  if (depth > CV[C_LINE] && CV[C_NEAR2] > TH.freeWithin * TH.freeWithin) mult = TH.recvBehind;
  else if (oKind[k] === K_FEET && depth > CV[C_DEPTH] && nearOpp2(m, j) <= TH.pressedWithin * TH.pressedWithin) mult = TH.recvBack;
  oRaw[k] = p * threatAt(side, ax, ay) * mult - (1 - p) * CV[C_RISK] * threatAt((1 - side) as Side, CV[C_LOSS_X], CV[C_LOSS_Y]);
  oDone[k] = 1;
}

/** Keep topV as the best `want` values seen (best first). */
function insertTop(v: number, want: number): void {
  if (nTop >= want && !(v > topV[want - 1])) return;
  let r = nTop < want ? nTop++ : want - 1;
  while (r > 0 && v > topV[r - 1]) { topV[r] = topV[r - 1]; r--; }
  topV[r] = v;
}

/** Option k's raw value `s` plus the tactic nudges (SC, sCounter and sOverdue must be set). */
function scoreOf(k: number, s: number): number {
  const side = cSide;
  const kind = oKind[k];
  const dDepth = depthOf(side, oX[k]) - CV[C_DEPTH];
  const tempoF = clamp(dDepth / DC.tempoDepth, -1, 1);
  if (kind === K_CARRY) s += SC[2] * tempoF * DC.carryTempoShare;
  else if (kind !== K_HOLD) {
    if (oLen[k] >= DC.longPass) s += SC[1]; else if (oLen[k] <= DC.shortPass) s -= SC[1];
    s += SC[2] * tempoF;
  }
  if (kind !== K_HOLD) {
    const a = acrossOf(side, oY[k]);
    if (a < DC.wideWithin || a > WIDTH - DC.wideWithin) s += SC[3];
  }
  if (sCounter && dDepth > DC.counterForward) s += DC.counterBonus * SC[0];
  if (kind === K_HOLD && sOverdue) s -= DC.holdPenalty * SC[0];
  return s;
}

/** Ground and/or lofted versions of a pass, depending on its length and the team's directness. */
function addVariants(m: SpatialMatch, j: number, ax: number, ay: number, kind: number): void {
  const dx = ax - CV[C_BX], dy = ay - CV[C_BY];
  const d2 = dx * dx + dy * dy;
  if (d2 <= CV[C_LOFT_OVER] * CV[C_LOFT_OVER]) addPass(m, j, ax, ay, kind, false);
  if (d2 >= P.loftFrom * P.loftFrom) addPass(m, j, ax, ay, kind, true);
}

/** Fill top5 with the indices of the best `want` values of arr (best first); returns how many. */
function pickTop(arr: Float64Array, want: number): number {
  const c = nOpt < want ? nOpt : want;
  let n = 0;
  // One pass of insertion into a short sorted list; ties keep the earlier option first.
  for (let k = 0; k < nOpt; k++) {
    const v = arr[k];
    let r = n;
    while (r > 0 && v > arr[top5[r - 1]]) r--;
    if (r >= c) continue;
    for (let q = n < c ? n : c - 1; q > r; q--) top5[q] = top5[q - 1];
    top5[r] = k;
    if (n < c) n++;
  }
  return c;
}

function decide(m: SpatialMatch, i: number): void {
  const ob = m.onball;
  const b = m.ball;
  const now = m.clockMs;
  const side = sideOf(i);
  const opp = (1 - side) as Side;
  const team = m.teams[side];
  const tac = team.tactics;
  const keeper = i % 11 === 0;
  const at = ob.attr;
  const o = i * ATTRS;
  if (!keeper && inShotZone(side, b.x, b.y)) { standInShot(m, i, side); return; }

  cSide = side;
  CV[C_BX] = b.x;
  CV[C_BY] = b.y;
  CV[C_DEPTH] = depthOf(side, b.x);
  CV[C_ACROSS] = acrossOf(side, b.y);
  CV[C_LINE] = secondLastOpponent(m, side);
  CV[C_RISK] = TH.oppLossWeight * TH.riskByMentality[tac.mentality - 1];
  CV[C_LOFT_OVER] = P.loftOver[tac.directness - 1];
  CV[C_VIS] = keeper ? Math.max(at[o + A_VIS], at[o + A_KCK]) : at[o + A_VIS];
  cAllow = ob.pressured || now >= ob.holdUntil;
  nOpt = 0;

  // Passes to every team-mate he can see.
  const offLine = Math.max(CV[C_LINE], CV[C_DEPTH], LENGTH / 2);
  const range = V.base + V.perVis * CV[C_VIS];
  const range2 = range * range;
  const scanned = now - ob.scanAt[i] <= V.scanFresh * 1000;
  const fx = ob.faceX[i], fy = ob.faceY[i];
  const fovL = V.fovCos * Math.sqrt(fx * fx + fy * fy);
  const t0 = side * 11;
  const o0 = opp * 11;
  near2.fill(-1);
  for (let j = t0; j < t0 + 11; j++) {
    if (j === i) continue;
    const jx = m.px[j], jy = m.py[j];
    const dx = jx - CV[C_BX], dy = jy - CV[C_BY];
    const d2 = dx * dx + dy * dy;
    if (d2 > range2) continue;
    if (!scanned && fx * dx + fy * dy < fovL * Math.sqrt(d2)) continue;
    const dj = depthOf(side, jx);
    if (dj > offLine) continue;
    // In behind, for a runner on the shoulder of the last line.
    let td = -1;
    if (j !== t0 && dj <= CV[C_LINE] && CV[C_LINE] - dj <= P.throughShoulder) {
      const t = Math.min(CV[C_LINE] + P.throughBehind, P.throughMaxDepth);
      if (t >= CV[C_LINE] + P.throughBeyond) td = t;
    }
    // Before his time is up only balls beyond the line count (see addPass). A team-mate short of
    // the line and not running forward, with no ball in behind or into space beyond it, has none.
    if (!cAllow && td < 0 && offLine <= CV[C_LINE] && CV[C_LINE] >= 0.5 && dj <= CV[C_LINE] && (side === 0 ? m.vx[j] : -m.vx[j]) <= 0) continue;
    // To feet, leading him by half his run while the ball travels.
    let fax = jx, fay = jy;
    for (let it = 0; it < 2; it++) {
      const ex = fax - CV[C_BX], ey = fay - CV[C_BY];
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d <= CV[C_LOFT_OVER]) groundInto(d, IO); else loftInto(m.loft, d, IO);
      fax = jx + P.leadFactor * m.vx[j] * IO[1];
      fay = jy + P.leadFactor * m.vy[j] * IO[1];
    }
    addVariants(m, j, fax, fay, K_FEET);
    if (j === t0) continue;
    // Into space ahead of him, up to the offside line.
    const fd = depthOf(side, fax);
    const sd = Math.min(fd + P.spaceAhead, offLine);
    if (sd - fd >= P.spaceMin) addVariants(m, j, depthOf(side, sd), fay, K_SPACE);
    if (td >= 0) addVariants(m, j, depthOf(side, td), fay, K_THROUGH);
  }

  const nPass = nOpt;
  const px = m.px[i], py = m.py[i];
  const lossHere = CV[C_RISK] * threatAt(opp, px, py);
  // Carries: a few metres in one of five directions.
  if (!keeper) {
    const dir = side === 0 ? 1 : -1;
    const dri = at[o + A_DRI] / 99;
    // Only opponents near enough to stand in some carry's way (its far end is at most a metre
    // past the carry length after the pitch clamp).
    const far = CA.length + 1 + CA.blockR;
    let nb = 0;
    for (let j = o0; j < o0 + 11; j++) {
      const ex = m.px[j] - px, ey = m.py[j] - py;
      if (ex * ex + ey * ey < far * far) blk[nb++] = j;
    }
    for (let k = 0; k < CARRY_COS.length && nOpt < CAP; k++) {
      const cx = dir * CARRY_COS[k], cy = dir * CARRY_SIN[k];
      const ex = clamp(px + cx * CA.length, 1, LENGTH - 1);
      const ey = clamp(py + cy * CA.length, 1, WIDTH - 1);
      // An opponent standing in the way blocks the carry; one behind him does not.
      const sx = px + cx * CA.blockFrom, sy = py + cy * CA.blockFrom;
      let dmin = Infinity;
      for (let q = 0; q < nb; q++) {
        const j = blk[q];
        const e = segmentDistance(m.px[j], m.py[j], sx, sy, ex, ey);
        if (e < dmin) dmin = e;
      }
      const close = clamp(1 - dmin / CA.blockR, 0, 1);
      const p = 1 - CA.blockRisk * close * (CA.driBase - CA.driGain * dri);
      pushOption(K_CARRY, i, ex, ey, 0, 0, CA.length, p * threatAt(side, ex, ey) - (1 - p) * lossHere);
    }
  }
  // Hold: shield it from the nearest opponent.
  {
    let nk = -1, nd2 = Infinity;
    for (let k = o0; k < o0 + 11; k++) {
      const ex = px - m.px[k], ey = py - m.py[k];
      const e2 = ex * ex + ey * ey;
      if (e2 < nd2) { nd2 = e2; nk = k; }
    }
    const nd = Math.sqrt(nd2);
    let hx = px, hy = py;
    if (nk >= 0 && nd > 1e-9) {
      hx = clamp(px + ((px - m.px[nk]) / nd) * CA.shieldStep, 0.5, LENGTH - 0.5);
      hy = clamp(py + ((py - m.py[nk]) / nd) * CA.shieldStep, 0.5, WIDTH - 0.5);
    }
    const p = 1 - CA.holdRisk * clamp(1 - nd / CA.holdR, 0, 1);
    if (nOpt < CAP) pushOption(K_HOLD, i, hx, hy, 0, 0, 0, p * threatAt(side, px, py) - (1 - p) * lossHere);
  }
  // Clearance: under pressure deep in his own half, or the keeper going long.
  if (cAllow && nOpt < CAP && (keeper || (ob.pressured && CV[C_DEPTH] < CL.depth))) {
    const len = (CL.length[0] + CL.length[1]) / 2;
    const ex = depthOf(side, clamp(CV[C_DEPTH] + len, 1, LENGTH - 1));
    const p = CL.retain;
    pushOption(K_CLEAR, -1, ex, CV[C_BY], 1, 0, len, p * threatAt(side, ex, CV[C_BY]) - (1 - p) * CV[C_RISK] * threatAt(opp, ex, CV[C_BY]));
  }

  // Passes are checked against the defence best-first by the most each could be worth, and one
  // that could not make the shortlist is never checked. The choice is the same as checking all.
  const N = m.mode === 'fine' ? DC.topN.fine : DC.topN.coarse;
  for (let k = 0; k < nPass; k++) {
    const u = oUB[k];
    let r = k;
    while (r > 0 && u > oUB[byUB[r - 1]]) { byUB[r] = byUB[r - 1]; r--; }
    byUB[r] = k;
  }
  nTop = 0;
  for (let k = nPass; k < nOpt; k++) insertTop(oRaw[k], N);
  let r = 0;
  for (; r < nPass; r++) {
    const k = byUB[r];
    if (nTop >= N && oUB[k] + EPS < topV[N - 1]) break;
    evalPass(m, k);
    insertTop(oRaw[k], N);
  }

  // The spread of the best raw scores sets the scale for tactic nudges and noise.
  let c = pickTop(oRaw, N);
  const S = Math.max(DC.minScale, oRaw[top5[0]] - oRaw[top5[c > 2 ? 2 : c - 1]]);
  const tb = DC.tacticBonus * S;
  SC[0] = S;
  SC[1] = (tac.directness - 3) * tb;
  SC[2] = (tac.tempo - 3) * tb;
  SC[3] = (tac.width - 3) * tb;
  sCounter = now < team.counterUntil;
  sOverdue = now >= ob.holdUntil;
  nTop = 0;
  for (let k = 0; k < nOpt; k++) {
    if (k < nPass && oDone[k] === 0) { oScore[k] = -Infinity; continue; }
    oScore[k] = scoreOf(k, oRaw[k]);
    insertTop(oScore[k], N);
  }
  // A pass left out so far could still make the shortlist on its tactic nudges.
  for (; r < nPass; r++) {
    const k = byUB[r];
    if (nTop >= N && oUB[k] + scoreOf(k, 0) + EPS < topV[N - 1]) continue;
    evalPass(m, k);
    oScore[k] = scoreOf(k, oRaw[k]);
    insertTop(oScore[k], N);
  }
  c = pickTop(oScore, N);
  const Q = DC.quality;
  const q = (Q[0] * at[o + A_VIS] + Q[1] * at[o + A_CMP] + Q[2] * at[o + A_POS]) / 99;
  const sd = DC.noise * (DC.noiseQ - q) * S;
  let pick = top5[0];
  let pickS = -Infinity;
  for (let r = 0; r < c; r++) {
    const k = top5[r];
    const v = oScore[k] + m.rng.normalDet(0, sd);
    if (v > pickS) { pickS = v; pick = k; }
  }
  switch (oKind[pick]) {
    case K_CARRY:
    case K_HOLD:
      ob.carryX = oX[pick];
      ob.carryY = oY[pick];
      break;
    case K_CLEAR:
      clearBall(m, i, side);
      break;
    default:
      strike(m, i, side, pick);
  }
}

// ---------------------------------------------------------------------------
// Kicks
// ---------------------------------------------------------------------------

const order = new Int32Array(11);

/** Play option k as a pass, with an aiming error that grows with length, pressure and a lofted ball. */
function strike(m: SpatialMatch, i: number, side: Side, k: number): void {
  const b = m.ball;
  const ob = m.onball;
  const o = i * ATTRS;
  const lofted = oLoft[k] === 1;
  const ax0 = oX[k], ay0 = oY[k];
  const dx = ax0 - b.x, dy = ay0 - b.y;
  const D0 = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / D0, uy = dy / D0;
  const pas = i % 11 === 0 ? ob.attr[o + A_KCK] : ob.attr[o + A_PAS];
  let sd = D0 * (P.aimBase + P.aimPas * (1 - pas / 99));
  if (ob.pressured) sd *= 1 + P.pressureCmp * (1 - ob.attr[o + A_CMP] / 99);
  if (lofted) sd *= P.loftErr;
  const along = m.rng.normalDet(0, P.lengthErr * sd);
  const across = m.rng.normalDet(0, sd);
  const ax = clamp(ax0 + ux * along - uy * across, 0.5, LENGTH - 0.5);
  const ay = clamp(ay0 + uy * along + ux * across, 0.5, WIDTH - 0.5);
  launch(m, i, side, oRecv[k], ax, ay, lofted, oWeight[k]);
}

/** Put the ball on its way to (ax, ay) for `recv`, rolling for interceptions on the way. */
function launch(m: SpatialMatch, i: number, side: Side, recv: number, ax: number, ay: number, lofted: boolean, weightT: number): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  const dx = ax - b.x, dy = ay - b.y;
  let D = Math.sqrt(dx * dx + dy * dy);
  if (D < 0.1) D = 0.1;
  const ux = dx / D, uy = dy / D;
  if (lofted) loftInto(m.loft, D, IO); else groundSpeed(D, weightT);
  const v0 = IO[0], tArr = IO[1];
  const rdx = ax - m.px[recv], rdy = ay - m.py[recv];
  const rd = Math.sqrt(rdx * rdx + rdy * rdy);
  const tr = P.recvReaction + (rd > 1e-9 ? reach(m, recv, rdx, rdy, rd, P.interceptReach) : 0);
  contest(m, side, b.x, b.y, ax, ay, D, ux, uy, lofted, v0, tArr, tr);
  // Opponents in the order the ball reaches them; the first to win his roll cuts it out.
  let n = 0;
  for (let q = 0; q < 11; q++) {
    if (cMiss[q] >= 1) continue;
    let p = n++;
    while (p > 0 && cS[order[p - 1]] > cS[q]) { order[p] = order[p - 1]; p--; }
    order[p] = q;
  }
  let cut = -1;
  for (let r = 0; r < n; r++) {
    if (m.rng.chance(1 - cMiss[order[r]])) { cut = order[r]; break; }
  }
  b.state = lofted ? BALL_AIR : BALL_ROLL;
  b.owner = -1;
  b.z = 0;
  if (lofted) {
    const h = v0 * LOFT_COS;
    b.vx = ux * h; b.vy = uy * h; b.vz = v0 * LOFT_SIN;
  } else {
    b.vx = ux * v0; b.vy = uy * v0; b.vz = 0;
  }
  b.strikeMs = now;
  ob.passTarget = recv;
  ob.aimX = ax;
  ob.aimY = ay;
  ob.passArriveMs = now + Math.round(tArr * 1000);
  ob.lastPasser = i;
  ob.passSide = side;
  ob.passKind = 1;
  ob.passes[side]++;
  ob.pressured = false;
  if (cut >= 0) {
    const k = (1 - side) * 11 + cut;
    const s = cS[cut];
    const a = B.rollDecel;
    const tb = s >= D ? tArr : lofted ? (tArr * s) / D : (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * a * s))) / a;
    b.receiver = k;
    b.meetX = b.x + ux * s;
    b.meetY = b.y + uy * s;
    b.arriveMs = now + Math.round(tb * 1000);
    m.nextThink[k] = now;
  } else {
    b.receiver = recv;
    b.meetX = ax;
    b.meetY = ay;
    b.arriveMs = ob.passArriveMs;
  }
  m.nextThink[i] = now;
  m.nextThink[recv] = now;
}

/** Hoof it upfield. Whoever is nearest the drop, ours or theirs, goes for it. */
function clearBall(m: SpatialMatch, i: number, side: Side): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  const len = m.rng.float(CL.length[0], CL.length[1]);
  const d = clamp(depthOf(side, b.x) + len, 1, LENGTH - 1);
  const a = clamp(acrossOf(side, b.y) + m.rng.normalDet(0, CL.spread), 1, WIDTH - 1);
  const ax = depthOf(side, d), ay = acrossOf(side, a);
  const dx = ax - b.x, dy = ay - b.y;
  const D = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
  loftInto(m.loft, D, IO);
  const v0 = IO[0], tArr = IO[1];
  const to = m.rng.chance(CL.retain) ? side : 1 - side;
  let r = -1, rd2 = Infinity;
  for (let k = to * 11; k < to * 11 + 11; k++) {
    if (k === i) continue;
    const ex = m.px[k] - ax, ey = m.py[k] - ay;
    const e2 = ex * ex + ey * ey;
    if (e2 < rd2) { rd2 = e2; r = k; }
  }
  const h = v0 * LOFT_COS;
  b.state = BALL_AIR;
  b.owner = -1;
  b.z = 0;
  b.vx = (dx / D) * h; b.vy = (dy / D) * h; b.vz = v0 * LOFT_SIN;
  b.receiver = r;
  b.meetX = ax;
  b.meetY = ay;
  b.strikeMs = now;
  b.arriveMs = now + Math.round(tArr * 1000);
  ob.passTarget = r;
  ob.aimX = ax;
  ob.aimY = ay;
  ob.passArriveMs = b.arriveMs;
  ob.lastPasser = i;
  ob.passSide = side;
  ob.passKind = 2;
  ob.pressured = false;
  m.nextThink[i] = now;
  m.nextThink[r] = now;
}

/** Stand-in for a shot until build step 4: a firm ball along the ground to the keeper. */
function standInShot(m: SpatialMatch, i: number, side: Side): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  const kp = (1 - side) * 11;
  const dx = m.px[kp] - b.x, dy = m.py[kp] - b.y;
  const D = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
  const v0 = SI.speed;
  const a = B.rollDecel;
  const disc = v0 * v0 - 2 * a * D;
  const t = disc > 0 ? (v0 - Math.sqrt(disc)) / a : v0 / a;
  b.state = BALL_ROLL;
  b.owner = -1;
  b.z = 0;
  b.vx = (dx / D) * v0; b.vy = (dy / D) * v0; b.vz = 0;
  b.receiver = kp;
  b.meetX = m.px[kp];
  b.meetY = m.py[kp];
  b.strikeMs = now;
  b.arriveMs = now + Math.round(t * 1000);
  ob.passTarget = -1;
  ob.lastPasser = i;
  ob.passSide = side;
  ob.passKind = 3;
  ob.pressured = false;
  ob.shots[side]++;
  m.nextThink[i] = now;
  m.nextThink[kp] = now;
}

// ---------------------------------------------------------------------------
// The carrier: pressure, tackles, decisions
// ---------------------------------------------------------------------------

function carrierStep(m: SpatialMatch): void {
  const ob = m.onball;
  const now = m.clockMs;
  const i = m.ball.owner;
  const side = sideOf(i);
  const pressured = nearestOpponent2(m, side, m.px[i], m.py[i]) <= DC.pressureR * DC.pressureR;
  if (pressured && !ob.pressured) ob.decideAt = now;
  ob.pressured = pressured;
  if (!ob.entered && inAttackBox(side, m.ball.x, m.ball.y)) { ob.entered = true; ob.boxEntries[side]++; }
  if (tryTackle(m, i, side)) return;
  if (now < ob.readyAt || now < ob.decideAt) return;
  // Before his time is up he can only carry or play a ball in behind, so he looks again less
  // often, but always once his time is up.
  const fine = m.mode === 'fine';
  if (!pressured && now < ob.holdUntil) ob.decideAt = Math.min(now + (fine ? DC.earlyDecideMs.fine : DC.earlyDecideMs.coarse), ob.holdUntil);
  else ob.decideAt = now + (fine ? DC.decideMs.fine : DC.decideMs.coarse);
  decide(m, i);
}

/** The nearest opponent in reach may go to ground. Returns true if the carrier lost the ball. */
function tryTackle(m: SpatialMatch, i: number, side: Side): boolean {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  if (i % 11 === 0 && inOwnBox(side, m.px[i], m.py[i])) return false;
  const o = (1 - side) * 11;
  let k = -1, kd2 = TK.reach * TK.reach;
  for (let j = o; j < o + 11; j++) {
    if (ob.tackleReady[j] > now) continue;
    const dx = b.x - m.px[j], dy = b.y - m.py[j];
    const d2 = dx * dx + dy * dy;
    if (d2 < kd2) { kd2 = d2; k = j; }
  }
  if (k < 0) return false;
  const dx = m.px[i] - m.px[k], dy = m.py[i] - m.py[k];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1e-9 && ((m.vx[i] - m.vx[k]) * dx + (m.vy[i] - m.vy[k]) * dy) / d > TK.fastEvade) return false;
  // Front on, between the carrier and where he is going, a defender can step in; from
  // the side or behind he has to chase. Pressers go in more readily.
  const ahead = d > 1e-9 ? -(m.vx[i] * dx + m.vy[i] * dy) / d : 0;
  let rate = ahead > TK.frontSpeed ? TK.frontRate : TK.rate;
  if (m.teams[1 - side].pressSet.includes(k)) rate *= TK.pressMul;
  if (!m.rng.chance(rate * m.stepS)) return false;
  ob.tackles[1 - side]++;
  const win = clamp(TK.base + (TK.perFive * (ob.attr[k * ATTRS + A_TCK] - ob.attr[i * ATTRS + A_DRI])) / 5, TK.min, TK.max);
  if (m.rng.chance(win)) {
    if (m.rng.chance(TK.winControl)) control(m, k);
    else poke(m, k, i);
    return true;
  }
  ob.tackleReady[k] = now + TK.cooldown * 1000;
  m.vx[k] *= TK.beatenKeep;
  m.vy[k] *= TK.beatenKeep;
  return false;
}

/** A tackle that knocks the ball loose instead of winning it cleanly. */
function poke(m: SpatialMatch, k: number, i: number): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  const th = m.rng.normalDet(0, TK.pokeSpread);
  const c = detCos(th), s = detSin(th);
  const fl = Math.sqrt(ob.faceX[k] * ob.faceX[k] + ob.faceY[k] * ob.faceY[k]);
  const fx = ob.faceX[k] / fl, fy = ob.faceY[k] / fl;
  const v = m.rng.float(TK.looseSpeed[0], TK.looseSpeed[1]);
  b.state = BALL_ROLL;
  b.owner = -1;
  b.receiver = -1;
  b.z = 0;
  b.vz = 0;
  b.vx = (fx * c - fy * s) * v;
  b.vy = (fx * s + fy * c) * v;
  ob.touchBlock[k] = now + C.retouchMs;
  ob.touchBlock[i] = now + C.retouchMs;
  ob.lastTouch = k;
  ob.touchAt = now;
  ob.chaseAt = now;
  ob.passTarget = -1;
  ob.passKind = 0;
  m.nextThink[k] = now;
  m.nextThink[i] = now;
}

// ---------------------------------------------------------------------------
// Ball contacts: receiving, first touches, loose balls
// ---------------------------------------------------------------------------

/** Called by the engine after the ball moved from (x0, y0) this step. */
export function ballContacts(m: SpatialMatch, x0: number, y0: number): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  if (b.state !== BALL_ROLL && b.state !== BALL_AIR) return;
  let r = b.receiver;
  if (r >= 0) {
    // An interceptor who did not get there: the ball carries on to the intended receiver.
    if (r !== ob.passTarget && ob.passTarget >= 0) {
      const ex = b.x - b.meetX, ey = b.y - b.meetY;
      if (ex * b.vx + ey * b.vy > 0 && ex * ex + ey * ey > 1) {
        m.nextThink[r] = now;
        r = ob.passTarget;
        b.receiver = r;
        b.meetX = ob.aimX;
        b.meetY = ob.aimY;
        b.arriveMs = ob.passArriveMs;
        m.nextThink[r] = now;
      }
    }
    if (b.z < C.headReach && segmentDistance(m.px[r], m.py[r], x0, y0, b.x, b.y) <= handReach(r, b.x, b.y)) {
      const cut = ob.passKind === 1 && sideOf(r) !== ob.passSide;
      touch(m, r, cut ? C.interceptMul : 1);
      return;
    }
    const stalled = b.state === BALL_ROLL && b.vx * b.vx + b.vy * b.vy < P.stallSpeed * P.stallSpeed;
    if (stalled || now >= b.arriveMs + P.graceMs) {
      // Nobody got there: it is anybody's ball.
      m.nextThink[r] = now;
      if (ob.passTarget >= 0) m.nextThink[ob.passTarget] = now;
      b.receiver = -1;
      ob.passTarget = -1;
      ob.chaseAt = now;
    }
    return;
  }
  if (b.z >= C.headReach) return;
  // Loose ball: the closest player of each side who can reach it.
  let p0 = -1, p1 = -1, d0 = Infinity, d1 = Infinity;
  for (let i = 0; i < N; i++) {
    if (ob.touchBlock[i] > now) continue;
    const d = segmentDistance(m.px[i], m.py[i], x0, y0, b.x, b.y);
    if (d > handReach(i, b.x, b.y)) continue;
    if (i < 11) { if (d <= d0) { d0 = d; p0 = i; } } else if (d <= d1) { d1 = d; p1 = i; }
  }
  if (p0 < 0 && p1 < 0) return;
  if (p0 >= 0 && p1 >= 0) {
    const a0 = ob.attr, o0 = p0 * ATTRS, o1 = p1 * ATTRS;
    const s0 = (a0[o0 + A_STR] + a0[o0 + A_PAC] + a0[o0 + A_AGG]) / 3;
    const s1 = (a0[o1 + A_STR] + a0[o1 + A_PAC] + a0[o1 + A_AGG]) / 3;
    const win0 = clamp(DU.base + (DU.perFive * (s0 - s1)) / 5, DU.min, DU.max);
    touch(m, m.rng.chance(win0) ? p0 : p1, C.duelMul);
    return;
  }
  touch(m, p0 >= 0 ? p0 : p1, 1);
}

/** Player i gets a touch on the ball: a catch, a clean first touch, or it gets away from him. */
function touch(m: SpatialMatch, i: number, mul: number): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  const side = sideOf(i);
  if (ob.passKind === 1) {
    if (side === ob.passSide) ob.completed[side]++;
    else ob.intercepted[ob.passSide]++;
  }
  ob.passKind = 0;
  if (i % 11 === 0 && inOwnBox(side, b.x, b.y)) { control(m, i); return; }
  const o = i * ATTRS;
  const at = ob.attr;
  if (b.z >= C.chestBelow) {
    const loose = (C.headLooseBase - (C.headLooseHea * at[o + A_HEA]) / 99) * mul;
    if (!m.rng.chance(loose)) { control(m, i); return; }
    // Headed on, roughly the way he is facing up the pitch.
    const th = m.rng.normalDet(0, C.looseSpread);
    const v = m.rng.float(C.headSpeed[0], C.headSpeed[1]);
    const dir = side === 0 ? 1 : -1;
    b.vx = dir * detCos(th) * v;
    b.vy = dir * detSin(th) * v;
    b.vz = C.headLift;
    b.state = BALL_AIR;
    loseTouch(m, i);
    return;
  }
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const speedF = clamp((sp - C.speedFrom) / C.speedSpan, 0, 1);
  const pressF = clamp(1 - Math.sqrt(nearestOpponent2(m, side, m.px[i], m.py[i])) / C.pressureWithin, 0, 1);
  const tech = (at[o + A_DRI] + at[o + A_CMP]) / 198;
  let loose = (C.looseMin + (C.looseMax - C.looseMin) * (C.wSpeed * speedF + C.wPressure * pressF + C.wTech * (1 - tech))) * mul;
  if (b.z >= C.footBelow) loose = loose * C.chestMul + C.chestAdd;
  if (!m.rng.chance(loose)) { control(m, i); return; }
  // It squirms away along the way it was going (or the way he faces if it was nearly dead).
  let ux = b.vx, uy = b.vy, u = sp;
  if (u < 0.5) { ux = ob.faceX[i]; uy = ob.faceY[i]; u = Math.sqrt(ux * ux + uy * uy); }
  ux /= u; uy /= u;
  const th = m.rng.normalDet(0, C.looseSpread);
  const c = detCos(th), s = detSin(th);
  const v = m.rng.float(C.looseSpeed[0], C.looseSpeed[1]);
  b.vx = (ux * c - uy * s) * v;
  b.vy = (ux * s + uy * c) * v;
  b.z = 0;
  b.vz = 0;
  b.state = BALL_ROLL;
  loseTouch(m, i);
}

function loseTouch(m: SpatialMatch, i: number): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  if (b.receiver >= 0) m.nextThink[b.receiver] = now;
  if (ob.passTarget >= 0) m.nextThink[ob.passTarget] = now;
  b.owner = -1;
  b.receiver = -1;
  ob.passTarget = -1;
  ob.lastTouch = i;
  ob.touchAt = now;
  ob.touchBlock[i] = now + C.retouchMs;
  ob.chaseAt = now;
  m.nextThink[i] = now;
}

// ---------------------------------------------------------------------------
// Chasing a loose ball
// ---------------------------------------------------------------------------

const SX = new Float64Array(CH.samples);
const SY = new Float64Array(CH.samples);

/** Each side sends the player who can get to the ball's path first. */
/** Where the ball will be every CH.sampleS seconds from now, into SX/SY. */
function samplePath(m: SpatialMatch): void {
  const b = m.ball;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const ux = sp > 1e-9 ? b.vx / sp : 0, uy = sp > 1e-9 ? b.vy / sp : 0;
  const a = B.rollDecel;
  const stopT = sp / a;
  for (let k = 0; k < CH.samples; k++) {
    const t = k * CH.sampleS;
    let x: number, y: number;
    if (b.state === BALL_AIR) { x = b.x + b.vx * t; y = b.y + b.vy * t; }
    else {
      const tt = t < stopT ? t : stopT;
      const d = sp * tt - 0.5 * a * tt * tt;
      x = b.x + ux * d; y = b.y + uy * d;
    }
    SX[k] = clamp(x, 0, LENGTH);
    SY[k] = clamp(y, 0, WIDTH);
  }
}

function pickChasers(m: SpatialMatch): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  ob.chaseAt = now + Math.round(CH.every * 1000);
  const n = CH.samples;
  samplePath(m);
  for (let side = 0; side < 2; side++) {
    let best = -1, bestK = n, bestM = Infinity;
    let fall = -1, fallLate = Infinity;
    for (let i = side * 11; i < side * 11 + 11; i++) {
      const keeper = i % 11 === 0;
      for (let k = 0; k < n && k <= bestK; k++) {
        if (keeper && !inOwnBox(side as Side, SX[k], SY[k])) continue;
        const dx = SX[k] - m.px[i], dy = SY[k] - m.py[i];
        const d = Math.sqrt(dx * dx + dy * dy);
        const t = CH.reaction + (d > 1e-9 ? reach(m, i, dx, dy, d, keeper ? handReach(i, SX[k], SY[k]) : B.controlReach) : 0);
        const late = t - k * CH.sampleS;
        if (late <= 0) {
          if (k < bestK || late < bestM) { best = i; bestK = k; bestM = late; }
          break;
        }
        if (late < fallLate) { fallLate = late; fall = i; }
      }
    }
    let x: number, y: number;
    if (best >= 0) { x = SX[bestK]; y = SY[bestK]; }
    else { best = fall; x = SX[n - 1]; y = SY[n - 1]; }
    const old = ob.chase[side];
    if (best !== old) {
      if (old >= 0) m.nextThink[old] = now;
      if (best >= 0) m.nextThink[best] = now;
    }
    ob.chase[side] = best;
    ob.chaseX[side] = x;
    ob.chaseY[side] = y;
  }
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

/** One step of on-ball play: stats, facing and scans, then the carrier or the loose ball. */
export function onBallStep(m: SpatialMatch): void {
  const b = m.ball;
  if (b.state === BALL_FROZEN) return;
  const ob = m.onball;
  const now = m.clockMs;
  ob.possMs[m.poss] += m.stepMs;
  const fm2 = V.facingMinSpeed * V.facingMinSpeed;
  for (let i = 0; i < N; i++) {
    const vx = m.vx[i], vy = m.vy[i];
    const s2 = vx * vx + vy * vy;
    if (s2 > fm2) { ob.faceX[i] = vx; ob.faceY[i] = vy; }
    if (now >= ob.nextScan[i]) {
      ob.scanAt[i] = now;
      ob.nextScan[i] += ob.scanMs[i];
    }
  }
  if (b.state === BALL_HELD) {
    if (b.owner >= 0) carrierStep(m);
  } else if (b.receiver < 0 && now >= ob.chaseAt) pickChasers(m);
}

/**
 * Where a player the ball is coming to runs this step. A pass with aim error is not where
 * it was meant to go, so he gets on the ball's real line, a step towards it; a lofted ball
 * is met where it drops; a ball that has gone past him is chased.
 */
export function receiveTarget(m: SpatialMatch, i: number, out: Float64Array): void {
  const b = m.ball;
  const now = m.clockMs;
  if (b.state === BALL_AIR && b.z >= C.headReach) {
    if (b.receiver === i && now < b.arriveMs) { out[0] = b.meetX; out[1] = b.meetY; return; }
    if (m.onball.passTarget === i && now < m.onball.passArriveMs) { out[0] = m.onball.aimX; out[1] = m.onball.aimY; return; }
  }
  if (b.vx * b.vx + b.vy * b.vy < 0.25) { out[0] = b.x; out[1] = b.y; return; }
  // The first point on the ball's path he can get to before it; failing that, where it stops.
  samplePath(m);
  const n = CH.samples;
  let k = 0;
  for (; k < n; k++) {
    const dx = SX[k] - m.px[i], dy = SY[k] - m.py[i];
    const d = Math.sqrt(dx * dx + dy * dy);
    if ((d > 1e-9 ? reach(m, i, dx, dy, d, B.controlReach) : 0) <= k * CH.sampleS) break;
  }
  if (k >= n) k = n - 1;
  out[0] = SX[k];
  out[1] = SY[k];
}

/** Players who were beaten to a pass step out of its way so the ball does not pass through them. */
export function clearOfPath(m: SpatialMatch): void {
  const b = m.ball;
  const ob = m.onball;
  if (b.receiver < 0 || (b.state !== BALL_ROLL && b.state !== BALL_AIR) || b.z >= C.headReach) return;
  const sx = b.vx * m.stepS, sy = b.vy * m.stepS;
  const L2 = sx * sx + sy * sy;
  const minStep = P.clearOfPath * m.stepS;
  if (L2 < minStep * minStep) return;
  const L = Math.sqrt(L2);
  const R = P.clearOfPath;
  const now = m.clockMs;
  for (let i = 0; i < N; i++) {
    if (i === b.receiver || i === ob.passTarget || i === ob.chase[0] || i === ob.chase[1] || ob.touchBlock[i] > now) continue;
    const f = clamp(((m.px[i] - b.x) * sx + (m.py[i] - b.y) * sy) / L2, 0, 1);
    const cx = b.x + f * sx, cy = b.y + f * sy;
    const dx = m.px[i] - cx, dy = m.py[i] - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= R * R) continue;
    let ux: number, uy: number;
    if (d2 < 1e-12) { ux = -sy / L; uy = sx / L; }
    else { const d = Math.sqrt(d2); ux = dx / d; uy = dy / d; }
    m.px[i] = clamp(cx + ux * R, 0, LENGTH);
    m.py[i] = clamp(cy + uy * R, 0, WIDTH);
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface SideStats {
  /** Share of the match with the ball, 0..1. */
  possession: number;
  passes: number;
  completed: number;
  /** completed / passes, 0..1. */
  completion: number;
  /** This side's passes the other side intercepted. */
  intercepted: number;
  /** Tackles this side went in for, won or lost. */
  tackles: number;
  /** Possessions that got the ball into the opponent's penalty area. */
  boxEntries: number;
  /** Stand-in shots until build step 4. */
  shots: number;
}

export function matchStats(m: SpatialMatch): [SideStats, SideStats] {
  const ob = m.onball;
  const total = ob.possMs[0] + ob.possMs[1];
  const one = (s: number): SideStats => ({
    possession: total > 0 ? ob.possMs[s] / total : 0.5,
    passes: ob.passes[s],
    completed: ob.completed[s],
    completion: ob.passes[s] > 0 ? ob.completed[s] / ob.passes[s] : 0,
    intercepted: ob.intercepted[s],
    tackles: ob.tackles[s],
    boxEntries: ob.boxEntries[s],
    shots: ob.shots[s],
  });
  return [one(0), one(1)];
}
