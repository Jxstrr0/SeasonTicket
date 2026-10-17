/**
 * Pressing, covering, man-marking and counter-attack runs: the off-the-ball jobs that
 * pull a player away from his shape spot.
 */
import { SPATIAL_TUNING } from '../data';
import { outDepth } from './shape';
import {
  BALL_HELD, LENGTH, WIDTH, acrossOf, clamp, depthOf, sideOf, type SpatialMatch, type TeamState,
} from './state';

const P = SPATIAL_TUNING.press;
const C = SPATIAL_TUNING.counter;
const MM = SPATIAL_TUNING.manMark;
const TR = SPATIAL_TUNING.track;
// cos and sin of 60 degrees, for the second and third pressers' angles of approach.
const COS60 = 0.5;
const SIN60 = 0.8660254037844386;

// Scratch space for picking pressers, reused every step so the hot loop makes no garbage.
const cand = new Int32Array(10);
const dist = new Float64Array(22);
const dir = new Float64Array(2);
const runners = new Int32Array(10);
const runDepth = new Float64Array(22);
const taken = new Uint8Array(11);

function resetPress(team: TeamState): void {
  team.pressEngaged = false;
  if (team.pressSet.length > 0) team.pressSet.length = 0;
  team.coverIdx = -1;
  team.pressAdv = 0;
}

/**
 * Decide who presses the ball for the team without it. Pressing starts when the ball is
 * inside the team's start zone and a player is close enough, lasts a few seconds, then the
 * team rests before it can press the same carrier again.
 */
export function updatePress(m: SpatialMatch, team: TeamState): void {
  const side = team.side;
  const b = m.ball;
  const carrier = b.state === BALL_HELD && b.owner >= 0 && sideOf(b.owner) !== side ? b.owner : -1;
  if (carrier < 0) {
    team.pressCarrier = -1;
    team.pressRestUntil = 0;
    resetPress(team);
    return;
  }
  const now = m.clockMs;
  if (carrier !== team.pressCarrier) {
    team.pressCarrier = carrier;
    team.pressRestUntil = 0;
    resetPress(team);
  }
  const p = team.tactics.pressing - 1;
  if (team.pressEngaged && now - team.pressStartMs >= P.chase[p] * 1000) {
    resetPress(team);
    team.pressRestUntil = now + P.rest * 1000;
  }
  if (!team.pressEngaged && now >= team.pressRestUntil) {
    const counterPressing = now < team.counterPressUntil;
    if (counterPressing || depthOf(side, b.x) <= P.startZone[p]) {
      const base = side * 11;
      // Outfielders by distance to the carrier (insertion sort; ties go to the lower index).
      let count = 0;
      for (let s = 1; s < 11; s++) {
        if (s === team.markerSlot && team.markTarget >= 0) continue;
        const i = base + s;
        const dx = m.px[i] - m.px[carrier];
        const dy = m.py[i] - m.py[carrier];
        const d = dx * dx + dy * dy;
        dist[i] = d;
        let k = count++;
        while (k > 0 && dist[cand[k - 1]] > d) { cand[k] = cand[k - 1]; k--; }
        cand[k] = i;
      }
      const range = P.engage[p] * (counterPressing ? P.counterPressEngage : 1);
      if (count > 0 && dist[cand[0]] <= range * range) {
        team.pressEngaged = true;
        team.pressStartMs = now;
        const n = Math.min(P.pressers[p], count);
        team.pressSet.length = 0;
        for (let k = 0; k < n; k++) team.pressSet.push(cand[k]);
        team.coverIdx = P.cover[p] && count > n ? cand[n] : -1;
      }
    }
  }
  // Midfielders behind the press step up by half of how far the pressers have left their spots.
  if (team.pressEngaged && team.pressSet.length > 0) {
    let sum = 0;
    for (const i of team.pressSet) {
      const s = i - side * 11;
      const ahead = depthOf(side, m.px[i]) - outDepth(team, s, m.steps);
      if (ahead > 0) sum += ahead;
    }
    team.pressAdv = (P.midfieldFollow * sum) / team.pressSet.length;
  } else {
    team.pressAdv = 0;
  }
}

/** Unit vector from (x, y) towards the middle of `side`'s own goal, in world coordinates, into `dir`. */
function towardsGoal(side: 0 | 1, x: number, y: number): void {
  const gx = side === 0 ? 0 : LENGTH;
  const dx = gx - x;
  const dy = 34 - y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 1e-9) { dir[0] = dx / len; dir[1] = dy / len; } else { dir[0] = side === 0 ? -1 : 1; dir[1] = 0; }
}

/** Where presser number k (0 = the main one) runs to. */
export function presserTarget(m: SpatialMatch, team: TeamState, k: number, out: Float64Array): void {
  const c = team.pressCarrier;
  towardsGoal(team.side, m.px[c], m.py[c]);
  const ux = dir[0], uy = dir[1];
  if (k === 0) {
    out[0] = m.px[c] + P.goalSide * ux;
    out[1] = m.py[c] + P.goalSide * uy;
  } else {
    // Second and third pressers come in at 60 degrees either side, closing the passing angles.
    const sgn = k === 1 ? 1 : -1;
    const rx = ux * COS60 - sgn * uy * SIN60;
    const ry = sgn * ux * SIN60 + uy * COS60;
    out[0] = m.px[c] + 2 * P.goalSide * rx;
    out[1] = m.py[c] + 2 * P.goalSide * ry;
  }
  clampOut(out);
}

/** The covering player sits behind and inside the main presser. */
export function coverTarget(m: SpatialMatch, team: TeamState, out: Float64Array): void {
  const side = team.side;
  presserTarget(m, team, 0, out);
  const d = depthOf(side, out[0]) - P.coverBehind;
  const a = acrossOf(side, out[1]);
  const inside = a < 34 ? Math.min(P.coverInside, 34 - a) : -Math.min(P.coverInside, a - 34);
  out[0] = depthOf(side, clamp(d, 1, LENGTH - 1));
  out[1] = acrossOf(side, a + inside);
}

/** The man-marker stays goal-side of his man. */
export function markTarget(m: SpatialMatch, team: TeamState, out: Float64Array): void {
  const j = team.markTarget;
  towardsGoal(team.side, m.px[j], m.py[j]);
  const ux = dir[0], uy = dir[1];
  const x = m.px[j] + MM.goalSide * ux;
  const y = m.py[j] + MM.goalSide * uy;
  const d = Math.min(depthOf(team.side, x), MM.maxDepth);
  out[0] = depthOf(team.side, d);
  out[1] = y;
  clampOut(out);
}

/**
 * Zonal tracking for the team without the ball. Opponents within reach of our goal are
 * taken in order of danger (nearest our goal first); each is picked up by the nearest free
 * defender whose zone he is in. That defender stays goal-side of him, tighter the nearer
 * he is to goal and the better a marker the defender is.
 */
export function updateTracking(m: SpatialMatch, team: TeamState): void {
  const side = team.side;
  for (let s = 0; s < 11; s++) team.track[s] = -1;
  if (m.poss === side) return;
  const o0 = (1 - side) * 11;
  let n = 0;
  for (let s = 1; s < 11; s++) {
    const j = o0 + s;
    if (j === m.ball.owner || j === team.markTarget) continue;
    const d = depthOf(side, m.px[j]);
    if (d >= TR.far) continue;
    runDepth[j] = d;
    let k = n++;
    while (k > 0 && runDepth[runners[k - 1]] > d) { runners[k] = runners[k - 1]; k--; }
    runners[k] = j;
  }
  if (n === 0) return;
  const base = side * 11;
  // Players busy pressing, covering or man-marking count as taken from the start.
  for (let s = 0; s < 11; s++) taken[s] = base + s === team.coverIdx || (s === team.markerSlot && team.markTarget >= 0) ? 1 : 0;
  for (let k = 0; k < team.pressSet.length; k++) taken[team.pressSet[k] - base] = 1;
  const r2 = TR.radius * TR.radius;
  for (let a = 0; a < n; a++) {
    const j = runners[a];
    let best = -1, bd = r2;
    for (let s = 1; s < 11; s++) {
      if (taken[s]) continue;
      const i = base + s;
      const dx = m.sx[i] - m.px[j], dy = m.sy[i] - m.py[j];
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = s; }
    }
    if (best >= 0) { taken[best] = 1; team.track[best] = j; }
  }
}

/** How far from his spot towards his runner a tracking defender goes, 0..1. */
export function trackWeight(m: SpatialMatch, team: TeamState, slot: number): number {
  const j = team.track[slot];
  const d = depthOf(team.side, m.px[j]);
  return clamp((TR.far - d) / (TR.far - TR.near), 0, 1) * m.tight[team.side * 11 + slot];
}

/** A tracking defender moves from his spot towards a point just goal-side of his runner. */
export function trackTarget(m: SpatialMatch, team: TeamState, slot: number, out: Float64Array): void {
  const i = team.side * 11 + slot;
  const j = team.track[slot];
  towardsGoal(team.side, m.px[j], m.py[j]);
  const gx = m.px[j] + TR.goalSide * dir[0];
  const gy = m.py[j] + TR.goalSide * dir[1];
  const w = trackWeight(m, team, slot);
  out[0] = m.sx[i] + w * (gx - m.sx[i]);
  out[1] = m.sy[i] + w * (gy - m.sy[i]);
  clampOut(out);
}

/** Counter-attack runners sprint into channels just short of the offside line. */
export function counterTarget(team: TeamState, slot: number, offCap: number, out: Float64Array): void {
  const n = team.counterSlots.length;
  const k = team.counterSlots.indexOf(slot);
  // One runner takes the middle channel; two take the outside ones; three go left, middle, right.
  const ch = C.channels;
  const a = k < 0 ? 34 : n === 1 ? ch[2] : n === 2 ? ch[k] : k === 0 ? ch[0] : k === 1 ? ch[2] : ch[1];
  out[0] = depthOf(team.side, clamp(offCap, 1, LENGTH - 1));
  out[1] = acrossOf(team.side, a);
}

function clampOut(out: Float64Array): void {
  out[0] = clamp(out[0], 0.5, LENGTH - 0.5);
  out[1] = clamp(out[1], 0.5, WIDTH - 0.5);
}
