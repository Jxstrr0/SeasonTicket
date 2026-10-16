/**
 * TEMPORARY scripted ball driver for build step 2 (docs/STAGE_4_5_SPATIAL_ENGINE.md).
 *
 * The engine does not make real on-ball decisions yet. To give the shapes something to
 * react to, the ball carrier holds the ball for a tempo-based time, carries it forward a
 * little, then passes to a weighted-random team-mate. A fixed share of passes go astray
 * to the nearest opponent, and a carrier who gets deep into the final third "shoots" to
 * the keeper. Step 3 replaces this file with real passing, dribbling and interceptions.
 */
import { SPATIAL_TUNING } from '../data';
import { groundPass, loftFor, LOFT_COS, LOFT_SIN } from './ball';
import {
  BALL_AIR, BALL_HELD, BALL_ROLL, LENGTH, WIDTH, acrossOf, clamp, depthOf, sideOf, type SpatialMatch,
} from './state';

const T = SPATIAL_TUNING;
const S = T.script;

/** Called when player i gains control of the ball. */
export function onControl(m: SpatialMatch, i: number): void {
  const side = sideOf(i);
  const slot = i - side * 11;
  const team = m.teams[side];
  if (slot === 0) {
    m.script.holdUntil = m.clockMs + S.keeperHold * 1000;
    m.script.carryX = m.px[i];
    m.script.carryY = m.py[i];
    return;
  }
  const hold = T.tempoHold[team.tactics.tempo - 1] * (1 + S.holdJitter * (2 * m.rng.next() - 1));
  m.script.holdUntil = m.clockMs + Math.round(hold * 1000);
  const d = clamp(depthOf(side, m.px[i]) + S.carryAhead, 1, LENGTH - 1);
  const a0 = acrossOf(side, m.py[i]);
  const a = a0 + S.carryDrift * (acrossOf(side, m.sy[i]) - a0);
  m.script.carryX = depthOf(side, d);
  m.script.carryY = acrossOf(side, clamp(a, 1, WIDTH - 1));
}

/** One step of scripted decisions for the player on the ball. */
export function scriptStep(m: SpatialMatch): void {
  const b = m.ball;
  if (b.state !== BALL_HELD || b.owner < 0) return;
  const i = b.owner;
  const side = sideOf(i);
  const slot = i - side * 11;
  if (slot !== 0 && depthOf(side, m.px[i]) > S.keeperDepth) {
    // Stand-in for a shot: play the ball to the opposing keeper.
    const gk = (1 - side) * 11;
    strike(m, i, m.px[gk], m.py[gk], gk);
    return;
  }
  if (m.clockMs >= m.script.holdUntil) pass(m, i);
}

interface Candidate { j: number; w: number }

function pass(m: SpatialMatch, i: number): void {
  const b = m.ball;
  const side = sideOf(i);
  const base = side * 11;
  const team = m.teams[side];
  const fromKeeper = i === base;
  const myDepth = depthOf(side, m.px[i]);
  const pref = T.passLength[team.tactics.directness - 1];
  const cands: Candidate[] = [];
  let nearest = -1;
  let nearestD = Infinity;
  for (let s = 0; s < 11; s++) {
    const j = base + s;
    if (j === i) continue;
    if (fromKeeper && (s === 0 || team.attU[s] > 0.4)) continue;
    const dx = m.px[j] - b.x;
    const dy = m.py[j] - b.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (s !== 0 && len < nearestD) { nearestD = len; nearest = j; }
    if (s === 0 && myDepth >= 35) continue;
    if (!fromKeeper && (len < S.passMin || len > S.passMax)) continue;
    const dd = depthOf(side, m.px[j]) - myDepth;
    const off = (len - pref) / S.lengthSpread;
    let w = (1 + (S.forwardWeight * dd) / (len > 1e-9 ? len : 1)) / (1 + off * off);
    if (s === 0) w *= 0.3;
    cands.push({ j, w });
  }
  let j: number;
  if (cands.length > 0) j = m.rng.weighted(cands, (c) => c.w).j;
  else if (nearest >= 0) j = nearest;
  else return;

  // Lead the receiver by half his current run, re-estimating the ball's travel time once.
  const loftOver = team.tactics.directness >= S.directDial ? S.loftOverDirect : S.loftOver;
  let tx = m.px[j];
  let ty = m.py[j];
  for (let k = 0; k < 2; k++) {
    const dx = tx - b.x;
    const dy = ty - b.y;
    const D = Math.sqrt(dx * dx + dy * dy);
    const time = D > loftOver ? loftFor(m.loft, D).time : groundPass(D).time;
    tx = clamp(m.px[j] + 0.5 * m.vx[j] * time, 1, LENGTH - 1);
    ty = clamp(m.py[j] + 0.5 * m.vy[j] * time, 1, WIDTH - 1);
  }
  let receiver = j;
  const pTurn = depthOf(side, tx) > S.finalThirdDepth ? S.turnoverFinalThird : S.turnover;
  if (m.rng.chance(pTurn)) {
    // Misplaced: the ball goes most of the way towards the opponent nearest its path.
    const ox = tx - b.x;
    const oy = ty - b.y;
    const L2 = ox * ox + oy * oy;
    let best = -1;
    let bestD = Infinity;
    let qx = b.x, qy = b.y;
    const o = (1 - side) * 11;
    for (let k = o; k < o + 11; k++) {
      let f = L2 > 1e-9 ? ((m.px[k] - b.x) * ox + (m.py[k] - b.y) * oy) / L2 : 0;
      f = clamp(f, 0, 1);
      const cx = b.x + f * ox;
      const cy = b.y + f * oy;
      const ex = m.px[k] - cx;
      const ey = m.py[k] - cy;
      const d = ex * ex + ey * ey;
      if (d < bestD) { bestD = d; best = k; qx = cx; qy = cy; }
    }
    tx = qx + S.misplaceShare * (m.px[best] - qx);
    ty = qy + S.misplaceShare * (m.py[best] - qy);
    receiver = best;
  }
  strike(m, i, tx, ty, receiver, loftOver);
}

/** Kick the ball from where it is towards (tx, ty) for `receiver`. */
export function strike(m: SpatialMatch, passer: number, tx: number, ty: number, receiver: number, loftOver = Infinity): void {
  const b = m.ball;
  const dx = tx - b.x;
  const dy = ty - b.y;
  const D = Math.sqrt(dx * dx + dy * dy);
  const ux = D > 1e-9 ? dx / D : 1;
  const uy = D > 1e-9 ? dy / D : 0;
  let time: number;
  if (D > loftOver) {
    const k = loftFor(m.loft, D);
    b.vx = ux * k.speed * LOFT_COS;
    b.vy = uy * k.speed * LOFT_COS;
    b.vz = k.speed * LOFT_SIN;
    b.state = BALL_AIR;
    time = k.time;
  } else {
    const k = groundPass(D);
    b.vx = ux * k.speed;
    b.vy = uy * k.speed;
    b.vz = 0;
    b.state = BALL_ROLL;
    time = k.time;
  }
  b.z = 0;
  b.owner = -1;
  b.receiver = receiver;
  b.meetX = tx;
  b.meetY = ty;
  b.strikeMs = m.clockMs;
  b.arriveMs = m.clockMs + Math.round(time * 1000);
  m.nextThink[passer] = m.clockMs;
  m.nextThink[receiver] = m.clockMs;
}
