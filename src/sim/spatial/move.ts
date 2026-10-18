/**
 * Player movement: each player steers towards his target with a speed limited by his
 * pace, his acceleration and how urgent the job is, then players are pushed apart so no
 * two stand on the same spot.
 */
import { SPATIAL_TUNING } from '../data';
import { trackWeight } from './press';
import { FINE_S, LENGTH, N, WIDTH, depthOf, type SpatialMatch } from './state';
import { ROLE } from './types';

const MV = SPATIAL_TUNING.move;
const GD = MV.gaitDistance;
const GS = MV.gaitSpeed;
const KP = SPATIAL_TUNING.keeper;
const SEP = MV.separation;
const SEP2 = SEP * SEP;

/** Roles that go at full speed whatever the distance. */
function urgent(role: number): boolean {
  return role === ROLE.PRESS || role === ROLE.COUNTER || role === ROLE.MARK || role === ROLE.RECEIVE || role === ROLE.RUN;
}

export function movePlayers(m: SpatialMatch): void {
  const dt = m.stepS;
  const owner = m.ball.owner;
  for (let i = 0; i < N; i++) {
    if (!m.on[i]) continue;
    const dx = m.tx[i] - m.px[i];
    const dy = m.ty[i] - m.py[i];
    const d = Math.sqrt(dx * dx + dy * dy);
    let cap: number;
    if (urgent(m.role[i]) || (i % 11 === 0 && m.teams[i < 11 ? 0 : 1].rush)) cap = m.top[i];
    else if (d < GD[0]) cap = GS[0];
    else if (d < GD[1]) cap = GS[1];
    else if (d < GD[2]) cap = GS[2];
    else if (d < GD[3]) cap = GS[3];
    else cap = m.top[i];
    // A keeper sets himself quickly when the ball is near his goal.
    if (i % 11 === 0 && cap < KP.setSpeed && depthOf(i < 11 ? 0 : 1, m.ball.x) < KP.setWithin) cap = KP.setSpeed;
    // A tracking defender keeps up with his runner.
    if (m.role[i] === ROLE.TRACK) {
      const side = i < 11 ? 0 : 1;
      const team = m.teams[side];
      const slot = i - side * 11;
      const j = team.track[slot];
      if (j >= 0) {
        const rv = Math.sqrt(m.vx[j] * m.vx[j] + m.vy[j] * m.vy[j]) * MV.trackMatch * trackWeight(m, team, slot);
        if (cap < rv) cap = rv;
      }
    }
    // Without the ball, a player whose spot is goal-side of him drops back in step with it,
    // at a run once he is well out of position.
    if ((m.role[i] === ROLE.SHAPE || m.role[i] === ROLE.TRACK) && m.poss !== (i < 11 ? 0 : 1)) {
      const back = i < 11 ? -dx : dx;
      if (back > 0) {
        const run = m.top[i] * MV.recoverShare;
        const rc = back > MV.recoverOver ? run : Math.min(run, d / MV.dropTau);
        if (cap < rc) cap = rc;
      }
    }
    // Getting open: a sharp move into the space he has picked.
    if (m.role[i] === ROLE.SHAPE && m.clockMs < m.attack.supBurst[i] && m.poss === (i < 11 ? 0 : 1)) {
      const bc = m.top[i] * SPATIAL_TUNING.support.burst;
      if (cap < bc) cap = bc;
    }
    let top = m.top[i];
    if (i === owner) { cap *= MV.withBall; top *= MV.withBall; }
    if (cap > top) cap = top;
    // Slow down in time to stop on the target (v^2 = 2 a d).
    // Close enough to the spot: stop rather than shuffle.
    // A player meeting the ball runs through his spot rather than easing into it.
    // (Square roots only when the answer needs them: the speed is capped, or the change is.)
    const decel = m.role[i] === ROLE.RECEIVE ? MV.receiveDecel : MV.arriveDecel;
    let want = 0;
    if (d > MV.settle) {
      const a2 = 2 * decel * (d - MV.settle);
      want = a2 < cap * cap ? Math.sqrt(a2) : cap;
    }
    const f = d > 1e-9 ? want / d : 0;
    let ax = dx * f - m.vx[i];
    let ay = dy * f - m.vy[i];
    const dv2 = ax * ax + ay * ay;
    const maxDv = m.acc[i] * dt;
    if (dv2 > maxDv * maxDv) { const s = maxDv / Math.sqrt(dv2); ax *= s; ay *= s; }
    let nvx = m.vx[i] + ax;
    let nvy = m.vy[i] + ay;
    const sp = Math.sqrt(nvx * nvx + nvy * nvy);
    if (sp > top) { nvx *= top / sp; nvy *= top / sp; }
    m.vx[i] = nvx;
    m.vy[i] = nvy;
    // In a long (coarse) step a player meeting the ball would run on well past the spot on its
    // path he was going for; he gets no further past it than one fine step's run, as he would
    // re-aim in fine steps, and keeps his speed.
    const run = (sp > top ? top : sp) * dt;
    const past = run - d;
    if (dt > FINE_S && m.role[i] === ROLE.RECEIVE && m.ball.receiver === i && d > 1e-9 && past > MV.coarseOvershoot && nvx * dx + nvy * dy > 0) {
      const over = MV.coarseOvershoot;
      m.px[i] = m.tx[i] + (dx / d) * over;
      m.py[i] = m.ty[i] + (dy / d) * over;
      const moved = d + over;
      m.dist[i] += moved;
      if (sp > MV.sprintOver) m.sprint[i] += moved;
      continue;
    }
    m.px[i] += nvx * dt;
    m.py[i] += nvy * dt;
    const moved = (sp > top ? top : sp) * dt;
    m.dist[i] += moved;
    if (sp > MV.sprintOver) m.sprint[i] += moved;
  }
  separate(m);
  for (let i = 0; i < N; i++) {
    if (!m.on[i]) continue;
    if (m.px[i] < 0) { m.px[i] = 0; if (m.vx[i] < 0) m.vx[i] = 0; }
    else if (m.px[i] > LENGTH) { m.px[i] = LENGTH; if (m.vx[i] > 0) m.vx[i] = 0; }
    if (m.py[i] < 0) { m.py[i] = 0; if (m.vy[i] < 0) m.vy[i] = 0; }
    else if (m.py[i] > WIDTH) { m.py[i] = WIDTH; if (m.vy[i] > 0) m.vy[i] = 0; }
  }
}

// Players in order along the pitch (scratch). Any starting order sorts to the same result.
const ord = new Int32Array(N).map((_, k) => k);
const xs = new Float64Array(N);

/**
 * Push overlapping pairs apart, half the overlap each. Players are swept in order along the
 * pitch (index breaks ties) so only near pairs are checked, which keeps the order deterministic.
 */
function separate(m: SpatialMatch): void {
  const px = m.px, py = m.py;
  for (let a = 0; a < N; a++) xs[a] = px[ord[a]];
  for (let a = 1; a < N; a++) {
    const k = ord[a];
    const x = xs[a];
    let b = a - 1;
    while (b >= 0 && (xs[b] > x || (xs[b] === x && ord[b] > k))) { ord[b + 1] = ord[b]; xs[b + 1] = xs[b]; b--; }
    ord[b + 1] = k;
    xs[b + 1] = x;
  }
  for (let a = 0; a < N - 1; a++) {
    for (let b = a + 1; b < N; b++) {
      if (xs[b] - xs[a] >= SEP) break;
      let i = ord[a], j = ord[b];
      if (!m.on[i] || !m.on[j]) continue;
      if (i > j) { const t = i; i = j; j = t; }
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
