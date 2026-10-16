/**
 * Deterministic maths for the spatial engine.
 *
 * Built only from + - * /, Math.sqrt, Math.round and exact powers of two, which every
 * JavaScript engine must round the same way (IEEE 754). The built-in sin, cos, exp, log,
 * pow and atan2 are allowed to differ in the last digit between browsers, and in a
 * spatial engine a last-digit difference grows into a different match. Accurate to
 * about 15 significant digits over the ranges the engine uses.
 */

const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e+00;
const SQRT2 = 1.4142135623730951;
const SQRT1_2 = 0.7071067811865476;
export const PI = 3.141592653589793;
const HALF_PI_HI = 1.5707963267341256e+00; // first 33 bits of pi/2
const HALF_PI_LO = 6.0771005065061922e-11; // pi/2 - HALF_PI_HI
const INV_HALF_PI = 6.36619772367581382433e-01;

/** 2^-1022 .. 2^1023, built by exact doubling and halving. */
const POW2 = new Float64Array(2046);
POW2[1022] = 1;
for (let k = 1; k <= 1023; k++) POW2[1022 + k] = POW2[1021 + k] * 2;
for (let k = 1; k <= 1022; k++) POW2[1022 - k] = POW2[1023 - k] * 0.5;

const E1 = 1, E2 = 1 / 2, E3 = 1 / 6, E4 = 1 / 24, E5 = 1 / 120, E6 = 1 / 720, E7 = 1 / 5040;
const E8 = 1 / 40320, E9 = 1 / 362880, E10 = 1 / 3628800, E11 = 1 / 39916800, E12 = 1 / 479001600;

export function detExp(x: number): number {
  if (x > 709) return Infinity;
  if (x < -708) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  const p = 1 + r * (E1 + r * (E2 + r * (E3 + r * (E4 + r * (E5 + r * (E6 + r * (E7 + r * (E8 + r * (E9 + r * (E10 + r * (E11 + r * E12)))))))))));
  return p * POW2[k + 1022];
}

const L3 = 1 / 3, L5 = 1 / 5, L7 = 1 / 7, L9 = 1 / 9, L11 = 1 / 11, L13 = 1 / 13, L15 = 1 / 15, L17 = 1 / 17, L19 = 1 / 19;

export function detLog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let e = 0;
  let m = x;
  while (m >= 65536) { m *= 1 / 65536; e += 16; }
  while (m < 1 / 65536) { m *= 65536; e -= 16; }
  while (m >= SQRT2) { m *= 0.5; e += 1; }
  while (m < SQRT1_2) { m *= 2; e -= 1; }
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  const p = 2 * s * (1 + s2 * (L3 + s2 * (L5 + s2 * (L7 + s2 * (L9 + s2 * (L11 + s2 * (L13 + s2 * (L15 + s2 * (L17 + s2 * L19)))))))));
  return e * LN2_HI + (p + e * LN2_LO);
}

/** a to the power b for a > 0. For small whole-number exponents use powInt, which is exact. */
export function detPow(a: number, b: number): number {
  if (a === 0) return b > 0 ? 0 : Infinity;
  return detExp(b * detLog(a));
}

/** a to a whole-number power by repeated multiplication (negative powers divide). */
export function powInt(a: number, n: number): number {
  let r = 1;
  const k = n < 0 ? -n : n;
  for (let i = 0; i < k; i++) r *= a;
  return n < 0 ? 1 / r : r;
}

const S3 = -1 / 6, S5 = 1 / 120, S7 = -1 / 5040, S9 = 1 / 362880, S11 = -1 / 39916800, S13 = 1 / 6227020800, S15 = -1 / 1307674368000;
const C2 = -1 / 2, C4 = 1 / 24, C6 = -1 / 720, C8 = 1 / 40320, C10 = -1 / 3628800, C12 = 1 / 479001600, C14 = -1 / 87178291200, C16 = 1 / 20922789888000;

function sinPoly(r: number): number {
  const r2 = r * r;
  return r + r * r2 * (S3 + r2 * (S5 + r2 * (S7 + r2 * (S9 + r2 * (S11 + r2 * (S13 + r2 * S15))))));
}
function cosPoly(r: number): number {
  const r2 = r * r;
  return 1 + r2 * (C2 + r2 * (C4 + r2 * (C6 + r2 * (C8 + r2 * (C10 + r2 * (C12 + r2 * (C14 + r2 * C16)))))));
}

export function detSin(x: number): number {
  const q = Math.round(x * INV_HALF_PI);
  const r = x - q * HALF_PI_HI - q * HALF_PI_LO;
  const k = ((q % 4) + 4) % 4;
  return k === 0 ? sinPoly(r) : k === 1 ? cosPoly(r) : k === 2 ? -sinPoly(r) : -cosPoly(r);
}

export function detCos(x: number): number {
  const q = Math.round(x * INV_HALF_PI);
  const r = x - q * HALF_PI_HI - q * HALF_PI_LO;
  const k = ((q % 4) + 4) % 4;
  return k === 0 ? cosPoly(r) : k === 1 ? -sinPoly(r) : k === 2 ? -cosPoly(r) : sinPoly(r);
}

const SQRT3 = 1.7320508075688772, TAN_PI_12 = 0.2679491924311227, PI_6 = 0.5235987755982988, PI_2 = 1.5707963267948966;
const A3 = -1 / 3, A5 = 1 / 5, A7 = -1 / 7, A9 = 1 / 9, A11 = -1 / 11, A13 = 1 / 13, A15 = -1 / 15;
const A17 = 1 / 17, A19 = -1 / 19, A21 = 1 / 21, A23 = -1 / 23, A25 = 1 / 25;

export function detAtan(x: number): number {
  let sign = 1;
  if (x < 0) { x = -x; sign = -1; }
  let base = 0;
  let inverted = false;
  if (x > 1) { x = 1 / x; inverted = true; }
  if (x > TAN_PI_12) { x = (x * SQRT3 - 1) / (x + SQRT3); base = PI_6; }
  const x2 = x * x;
  let a = x + x * x2 * (A3 + x2 * (A5 + x2 * (A7 + x2 * (A9 + x2 * (A11 + x2 * (A13 + x2 * (A15 + x2 * (A17 + x2 * (A19 + x2 * (A21 + x2 * (A23 + x2 * A25)))))))))));
  a += base;
  if (inverted) a = PI_2 - a;
  return sign * a;
}

export function detAtan2(y: number, x: number): number {
  if (x > 0) return detAtan(y / x);
  if (x < 0) return y >= 0 ? detAtan(y / x) + PI : detAtan(y / x) - PI;
  return y > 0 ? PI_2 : y < 0 ? -PI_2 : 0;
}

/** Smooth S-curve from 0 to 1 with s(0) = 0.5, using only + - * / (design appendix D4). */
export function sCurve(x: number): number {
  return 0.5 + (0.5 * x) / (1 + (x < 0 ? -x : x));
}
