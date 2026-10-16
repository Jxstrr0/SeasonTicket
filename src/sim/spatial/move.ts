/**
 * Player movement: each player steers towards his target with a speed limited by his
 * pace, his acceleration and how urgent the job is, then players are pushed apart so no
 * two stand on the same spot.
 */
import { SPATIAL_TUNING } from '../data';
import { LENGTH, N, WIDTH, type SpatialMatch } from './state';
import { ROLE } from './types';

const MV = SPATIAL_TUNING.move;
const GD = MV.gaitDistance;
const GS = MV.gaitSpeed;
const SEP = MV.separation;
const SEP2 = SEP * SEP;

/** Roles that go at full speed whatever the distance. */
function urgent(role: number): boolean {
  return role === ROLE.PRESS || role === ROLE.COUNTER || role === ROLE.MARK || role === ROLE.RECEIVE;
}

export function movePlayers(m: SpatialMatch): void {
  const dt = m.stepS;
  const owner = m.ball.owner;
  for (let i = 0; i < N; i++) {
    const dx = m.tx[i] - m.px[i];
    const dy = m.ty[i] - m.py[i];
    const d = Math.sqrt(dx * dx + dy * dy);
    let cap: number;
    if (urgent(m.role[i])) cap = m.top[i];
    else if (d < GD[0]) cap = GS[0];
    else if (d < GD[1]) cap = GS[1];
    else if (d < GD[2]) cap = GS[2];
    else if (d < GD[3]) cap = GS[3];
    else cap = m.top[i];
    let top = m.top[i];
    if (i === owner) { cap *= MV.withBall; top *= MV.withBall; }
    if (cap > top) cap = top;
    // Slow down in time to stop on the target (v^2 = 2 a d).
    // Close enough to the spot: stop rather than shuffle.
    const arrive = d <= MV.settle ? 0 : Math.sqrt(2 * MV.arriveDecel * (d - MV.settle));
    const want = arrive < cap ? arrive : cap;
    const wx = d > 1e-9 ? (dx / d) * want : 0;
    const wy = d > 1e-9 ? (dy / d) * want : 0;
    let ax = wx - m.vx[i];
    let ay = wy - m.vy[i];
    const dv = Math.sqrt(ax * ax + ay * ay);
    const maxDv = m.acc[i] * dt;
    if (dv > maxDv) { ax *= maxDv / dv; ay *= maxDv / dv; }
    let nvx = m.vx[i] + ax;
    let nvy = m.vy[i] + ay;
    const sp = Math.sqrt(nvx * nvx + nvy * nvy);
    if (sp > top) { nvx *= top / sp; nvy *= top / sp; }
    m.vx[i] = nvx;
    m.vy[i] = nvy;
    m.px[i] += nvx * dt;
    m.py[i] += nvy * dt;
    const moved = (sp > top ? top : sp) * dt;
    m.dist[i] += moved;
    if (sp > MV.sprintOver) m.sprint[i] += moved;
  }
  separate(m);
  for (let i = 0; i < N; i++) {
    if (m.px[i] < 0) { m.px[i] = 0; if (m.vx[i] < 0) m.vx[i] = 0; }
    else if (m.px[i] > LENGTH) { m.px[i] = LENGTH; if (m.vx[i] > 0) m.vx[i] = 0; }
    if (m.py[i] < 0) { m.py[i] = 0; if (m.vy[i] < 0) m.vy[i] = 0; }
    else if (m.py[i] > WIDTH) { m.py[i] = WIDTH; if (m.vy[i] > 0) m.vy[i] = 0; }
  }
}

/** Push overlapping pairs apart, half the overlap each. Fixed pair order keeps it deterministic. */
function separate(m: SpatialMatch): void {
  const px = m.px, py = m.py;
  for (let i = 0; i < N - 1; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = px[j] - px[i];
      const dy = py[j] - py[i];
      const d2 = dx * dx + dy * dy;
      if (d2 >= SEP2) continue;
      let d = Math.sqrt(d2);
      let ux: number, uy: number;
      if (d < 1e-6) {
        // Exactly on top of each other: split along the pitch, lower index towards the home goal.
        ux = 1; uy = 0; d = 0;
      } else {
        ux = dx / d; uy = dy / d;
      }
      const push = (SEP - d) * 0.5;
      px[i] -= ux * push; py[i] -= uy * push;
      px[j] += ux * push; py[j] += uy * push;
    }
  }
}
