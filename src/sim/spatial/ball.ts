/**
 * Ball physics for the spatial engine: rolling with constant deceleration, flight with
 * quadratic drag and gravity, bounces, and lookup tables for lofted kicks.
 *
 * Flight uses fixed substeps of length h and one integrator (semi-implicit Euler). The
 * loft tables are built with the very same integrator and h, so a lofted pass aimed at
 * a spot lands there to within a few centimetres. Only + - * / and Math.sqrt are used.
 */
import { SPATIAL_TUNING } from '../data';
import { PI, detCos, detSin } from './det';

const B = SPATIAL_TUNING.ball;

const LOFT_RAD = (B.loftDeg * PI) / 180;
export const LOFT_COS = detCos(LOFT_RAD);
export const LOFT_SIN = detSin(LOFT_RAD);

export interface FlightResult {
  /** Horizontal distance to the first landing. */
  carry: number;
  /** Seconds to the first landing. */
  time: number;
}

/**
 * One flight substep. Mutates `s` = [x, y, z, vx, vy, vz] in place.
 */
export function flightSubstep(s: Float64Array, h: number): void {
  const vx = s[3], vy = s[4], vz = s[5];
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const k = B.drag * speed;
  s[3] = vx - k * vx * h;
  s[4] = vy - k * vy * h;
  s[5] = vz - (k * vz + B.gravity) * h;
  s[0] += s[3] * h;
  s[1] += s[4] * h;
  s[2] += s[5] * h;
}

/** Fly a ball from the ground at `speed` and `cos`/`sin` of the launch angle until it first lands. */
export function simulateFlight(speed: number, cos: number, sin: number, h: number): FlightResult {
  const s = new Float64Array([0, 0, 0, speed * cos, 0, speed * sin]);
  let t = 0;
  for (let i = 0; i < 10000; i++) {
    const px = s[0], pz = s[2];
    flightSubstep(s, h);
    if (s[2] <= 0 && i > 0) {
      const f = pz / (pz - s[2]);
      return { carry: px + f * (s[0] - px), time: t + f * h };
    }
    t += h;
  }
  return { carry: s[0], time: t };
}

export interface LoftTable {
  h: number;
  speeds: Float64Array;
  carry: Float64Array;
  time: Float64Array;
}

const loftCache = new Map<number, LoftTable>();

/** The table of carry distance and flight time per launch speed at the standard loft angle. */
export function loftTable(h: number): LoftTable {
  const cached = loftCache.get(h);
  if (cached) return cached;
  const n = Math.round((B.loftMaxSpeed - B.loftMinSpeed) / B.loftTableStep) + 1;
  const speeds = new Float64Array(n);
  const carry = new Float64Array(n);
  const time = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    speeds[i] = B.loftMinSpeed + i * B.loftTableStep;
    const r = simulateFlight(speeds[i], LOFT_COS, LOFT_SIN, h);
    carry[i] = r.carry;
    time[i] = r.time;
  }
  const table = { h, speeds, carry, time };
  loftCache.set(h, table);
  return table;
}

/** Launch speed and flight time for a lofted kick that should carry `distance` metres. */
export function loftFor(table: LoftTable, distance: number): { speed: number; time: number } {
  const { speeds, carry, time } = table;
  const n = speeds.length;
  if (distance <= carry[0]) return { speed: speeds[0], time: time[0] };
  if (distance >= carry[n - 1]) return { speed: speeds[n - 1], time: time[n - 1] };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (carry[mid] < distance) lo = mid; else hi = mid;
  }
  const f = (distance - carry[lo]) / (carry[hi] - carry[lo]);
  return { speed: speeds[lo] + f * (speeds[hi] - speeds[lo]), time: time[lo] + f * (time[hi] - time[lo]) };
}

/** As loftFor, but writes [speed, time] into `out` so the hot loop makes no garbage. */
export function loftInto(table: LoftTable, distance: number, out: Float64Array): void {
  const { speeds, carry, time } = table;
  const n = speeds.length;
  if (distance <= carry[0]) { out[0] = speeds[0]; out[1] = time[0]; return; }
  if (distance >= carry[n - 1]) { out[0] = speeds[n - 1]; out[1] = time[n - 1]; return; }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (carry[mid] < distance) lo = mid; else hi = mid;
  }
  const f = (distance - carry[lo]) / (carry[hi] - carry[lo]);
  out[0] = speeds[lo] + f * (speeds[hi] - speeds[lo]);
  out[1] = time[lo] + f * (time[hi] - time[lo]);
}

/** As groundPass, but writes [speed, time] into `out`. */
export function groundInto(distance: number, out: Float64Array): void {
  const arrive = B.arriveBase + B.arrivePerM * distance;
  const speed = Math.sqrt(arrive * arrive + 2 * B.rollDecel * distance);
  out[0] = speed;
  out[1] = (speed - arrive) / B.rollDecel;
}

/** Ground pass: launch speed and travel time so the ball arrives `distance` away at a receivable pace. */
export function groundPass(distance: number): { speed: number; time: number } {
  const arrive = B.arriveBase + B.arrivePerM * distance;
  const speed = Math.sqrt(arrive * arrive + 2 * B.rollDecel * distance);
  return { speed, time: (speed - arrive) / B.rollDecel };
}

/** Distance a rolling ball covers before it stops. */
export function rollDistance(speed: number): number {
  return (speed * speed) / (2 * B.rollDecel);
}
