/**
 * Laws of the game for the spatial engine (Stage 4.5 build step 5, docs/DESIGN.md 17.6):
 * offside, fouls, advantage, cards, sendings-off, injuries and who takes each set piece.
 *
 * Same rules as the rest of the engine: random draws only through m.rng, no allocations in
 * the step (events and sendings-off are rare and may allocate), and only + - * /, Math.sqrt
 * and the det.ts helpers.
 */
import { MATCH_TUNING, SPATIAL_TUNING } from '../data';
import { threatAt } from './onball';
import { goDead } from './restart';
import { resolveMarker, secondLastOpponent } from './shape';
import { assignSpots, dropSubsFor, refreshPlayer } from './systems';
import {
  ATTRS, A_AGG, A_CMP, A_CRS, A_DRI, A_DUR, A_GKP, A_SPK, A_TCK, BALL_DEAD, BALL_HELD, LENGTH, N, RESTART_CORNER, RESTART_DROP,
  RESTART_FREE_KICK, RESTART_GOAL_KICK, RESTART_KICKOFF, RESTART_PENALTY, RESTART_THROW_IN, SP_CORNER, SP_GOAL_KICK,
  PS_FOULS, SP_NONE, SP_THROW, WIDTH, acrossOf, addStoppage, clamp, depthOf, idOf, pstatAdd, sideOf, type RulesState, type SpatialMatch,
} from './state';
import type { Side, SpatialEvent, SpatialEventKind } from './types';

const T = SPATIAL_TUNING;
const FO = T.foul;
const AD = T.advantage;
const CD = T.card;
const FK = T.freeKick;
const PEN = T.penalty;
const INJ = T.injury;
const SO = T.sentOff;
const RS = T.restart;
const PT = T.pitch;
const MAX_SUBS = MATCH_TUNING.squad.maxSubs;
const GC = PT.goalCentreAcross;
const HW = PT.goalWidth / 2;

/** How a foul came about (the card odds differ). */
export const FOUL_FRONT = 0;
export const FOUL_BEHIND = 1;
export const FOUL_DUEL = 2;
export const FOUL_AERIAL = 3;
export const FOUL_HOLD = 4;

export function createRules(): RulesState {
  return {
    yellow: new Uint8Array(N),
    hurt: new Uint8Array(N),
    offFlag: new Uint8Array(N),
    offSide: -1,
    advUntil: 0,
    advSide: -1,
    advX: 0,
    advY: 0,
    indirect: false,
    nWall: 0,
    wall: new Int32Array(6),
    wallX: new Float64Array(6),
    wallY: new Float64Array(6),
    shotKind: 0,
    fouls: new Int32Array(2),
    offsides: new Int32Array(2),
    yellows: new Int32Array(2),
    reds: new Int32Array(2),
    penalties: new Int32Array(2),
    penGoals: new Int32Array(2),
    freeKicks: new Int32Array(2),
    fkShots: new Int32Array(2),
    fkGoals: new Int32Array(2),
    injuries: new Int32Array(2),
    duels: new Int32Array(2),
    aerials: new Int32Array(2),
    advantages: new Int32Array(2),
    inPlayMs: 0,
  };
}

/** Record a referee moment by player i, with `other` a person code (events are rare, so this may allocate). */
export function pushEvent(m: SpatialMatch, kind: SpatialEventKind, i: number, x: number, y: number, note?: SpatialEvent['note'], other?: number): void {
  const e: SpatialEvent = { ms: m.clockMs, kind, side: sideOf(i), player: m.who[i], x, y };
  if (other !== undefined) e.other = other;
  if (note) e.note = note;
  m.events.push(e);
}

/** In the penalty area that `side` defends. */
export function inOwnBox(side: Side, x: number, y: number): boolean {
  const off = y < GC ? GC - y : y - GC;
  return depthOf(side, x) < PT.boxDepth && off < PT.boxHalfWidth;
}

/** Distance from (x, y) to the centre of the goal `side` attacks. */
function toGoal(side: Side, x: number, y: number): number {
  const g = LENGTH - depthOf(side, x);
  const e = y - GC;
  return Math.sqrt(g * g + e * e);
}

// ---------------------------------------------------------------------------
// Offside
// ---------------------------------------------------------------------------

/** Forget who was in an offside position. */
export function clearOffside(m: SpatialMatch): void {
  const R = m.rules;
  if (R.offSide < 0) return;
  R.offFlag.fill(0);
  R.offSide = -1;
}

/**
 * Player i of `side` has just played the ball: flag every team-mate in an offside position
 * (in the opponents' half, beyond the ball and beyond the second-last opponent; level is onside).
 */
function markOffside(m: SpatialMatch, side: Side, i: number): void {
  const R = m.rules;
  const line = secondLastOpponent(m, side);
  const bd = depthOf(side, m.ball.x);
  const t0 = side * 11;
  for (let j = t0; j < t0 + 11; j++) {
    if (j === i || !m.on[j]) continue;
    const d = depthOf(side, m.px[j]);
    if (d > PT.halfway && d > bd && d > line) { R.offFlag[j] = 1; R.offSide = side; }
  }
}

/**
 * Player i has just played the ball (a pass, a clearance, a shot, a header or a touch that
 * got away). Offside is judged now. Nobody is offside from a throw-in, a corner or a goal kick.
 */
export function played(m: SpatialMatch, i: number): void {
  const ob = m.onball;
  const sp = ob.setPiece;
  ob.setPiece = SP_NONE;
  m.rules.nWall = 0;
  clearOffside(m);
  if (sp === SP_THROW || sp === SP_CORNER || sp === SP_GOAL_KICK) return;
  markOffside(m, sideOf(i), i);
}

/** Player i is about to touch the ball. If he was offside when it was played, the flag goes up. */
export function offsideCall(m: SpatialMatch, i: number): boolean {
  const R = m.rules;
  const side = sideOf(i);
  if (R.offSide !== side || R.offFlag[i] === 0) return false;
  R.offsides[side]++;
  pushEvent(m, 'offside', i, m.px[i], m.py[i]);
  clearOffside(m);
  awardFreeKick(m, (1 - side) as Side, m.px[i], m.py[i], true);
  return true;
}

/** Player i is in an offside position and stays out of it (no chasing a loose ball). */
export function offsideNow(m: SpatialMatch, i: number): boolean {
  const R = m.rules;
  return R.offSide === sideOf(i) && R.offFlag[i] === 1;
}

// ---------------------------------------------------------------------------
// Fouls, cards and advantage
// ---------------------------------------------------------------------------

/**
 * The chance that a challenge by f on v is a foul: base by the kind of challenge, more for an
 * aggressive player and when the victim is the better player on the ball, less in his own box
 * and when he is already booked.
 */
export function foulChance(m: SpatialMatch, f: number, v: number, base: number, skill: boolean): number {
  const at = m.onball.attr;
  let p = base * (FO.aggBase + (FO.aggGain * at[f * ATTRS + A_AGG]) / 99);
  if (skill) p *= clamp(1 + (FO.skillPer10 * (at[v * ATTRS + A_DRI] - at[f * ATTRS + A_TCK])) / 10, FO.skillMin, FO.skillMax);
  const fs = sideOf(f);
  const d = depthOf(fs, m.px[v]);
  p *= FO.byThird[d < LENGTH / 3 ? 0 : d < (2 * LENGTH) / 3 ? 1 : 2];
  if (inOwnBox(fs, m.px[v], m.py[v])) p *= FO.ownBox;
  if (m.rules.yellow[f]) p *= FO.booked;
  return p;
}

/** v is through on goal and none of f's outfielders, f included, is between him and it (denying a goal). */
function denying(m: SpatialMatch, f: number, v: number): boolean {
  const vs = sideOf(v);
  if (toGoal(vs, m.px[v], m.py[v]) > CD.dogsoWithin) return false;
  if ((vs === 0 ? m.vx[v] : -m.vx[v]) <= 0) return false;
  const vd = depthOf(vs, m.px[v]);
  const base = (1 - vs) * 11;
  for (let s = 1; s < 11; s++) {
    const j = base + s;
    if (!m.on[j]) continue;
    if (depthOf(vs, m.px[j]) > vd) return false;
  }
  return true;
}

/** Book player i (for wasting time with `delay`); a second yellow is a red. Returns true if he is sent off. */
export function book(m: SpatialMatch, i: number, delay = false): boolean {
  const R = m.rules;
  const side = sideOf(i);
  R.yellows[side]++;
  addStoppage(m, T.periods.stoppage.cardS * 1000);
  if (R.yellow[i]) {
    pushEvent(m, 'yellow', i, m.px[i], m.py[i], 'second');
    sendOff(m, i, 'second');
    return true;
  }
  R.yellow[i] = 1;
  pushEvent(m, 'yellow', i, m.px[i], m.py[i], delay ? 'delay' : undefined);
  return false;
}

/**
 * Player f has fouled player v (kind FOUL_*). The referee gives a free kick or a penalty, a
 * card if it deserves one, and plays advantage when `canAdv` and v's side are better off
 * carrying on. Returns true if play stopped.
 */
export function foul(m: SpatialMatch, f: number, v: number, kind: number, canAdv: boolean): boolean {
  const R = m.rules;
  const fs = sideOf(f);
  const vs = (1 - fs) as Side;
  const x = m.px[v], y = m.py[v];
  const pen = inOwnBox(fs, x, y);
  R.fouls[fs]++;
  pstatAdd(m, f, PS_FOULS);
  pushEvent(m, 'foul', f, x, y, pen ? 'box' : undefined, m.who[v]);
  let red = false;
  let note: SpatialEvent['note'];
  let yellow = false;
  if (m.rng.chance(CD.straightRed)) red = true;
  else if (kind <= FOUL_BEHIND && denying(m, f, v)) {
    // In the box a genuine try for the ball is a penalty and a yellow; outside it, usually a red.
    if (!pen && m.rng.chance(CD.dogsoRed)) { red = true; note = 'dogso'; }
    else yellow = true;
  } else {
    // A trip from behind that stops a counter or a carrier going forward in the attacking half is tactical.
    const fwd = (vs === 0 ? m.vx[v] : -m.vx[v]) > 0;
    const tactical = kind === FOUL_BEHIND && (m.clockMs < m.teams[vs].counterUntil || (fwd && depthOf(vs, x) >= CD.promisingDepth));
    let p = tactical ? CD.tactical : kind === FOUL_BEHIND ? CD.behind : CD.front;
    if (R.yellow[f]) p *= CD.booked;
    yellow = m.rng.chance(p);
  }
  // Advantage: never on a penalty or a sending-off.
  if (canAdv && !pen && !red && threatAt(vs, x, y) >= AD.threat) {
    if (yellow && book(m, f)) {
      // A second yellow: the referee stops it after all.
    } else {
      R.advantages[vs]++;
      R.advSide = vs;
      R.advUntil = m.clockMs + AD.seconds * 1000;
      R.advX = x;
      R.advY = y;
      pushEvent(m, 'advantage', v, x, y);
      return false;
    }
  } else if (yellow) book(m, f);
  if (red) sendOff(m, f, note);
  if (pen) awardPenalty(m, vs, v);
  else awardFreeKick(m, vs, x, y, false);
  injuryRoll(m, f, v, INJ.foulMul);
  return true;
}

/**
 * Holding in the box as a corner comes in: mostly an attacker's foul (a free kick out), else a
 * defender's (a penalty). Returns true if the referee blew for one.
 */
export function cornerHolding(m: SpatialMatch, side: Side): boolean {
  if (!m.rng.chance(FO.cornerHold)) return false;
  let a = -1;
  for (let j = side * 11 + 1; j < side * 11 + 11; j++) if (m.on[j] && m.attack.boxSlot[j] >= 0) { a = j; break; }
  if (a < 0) return false;
  const d = nearestOf(m, (1 - side) as Side, m.px[a], m.py[a], false);
  if (d < 0) return false;
  return m.rng.chance(FO.cornerHoldAttacker) ? foul(m, a, d, FOUL_HOLD, false) : foul(m, d, a, FOUL_HOLD, false);
}

/** Advantage that came to nothing within its time brings the free kick back. */
export function rulesStep(m: SpatialMatch): void {
  const R = m.rules;
  if (R.advSide < 0) return;
  if (m.clockMs >= R.advUntil) { R.advSide = -1; return; }
  const o = m.ball.owner;
  if (m.ball.state === BALL_HELD && o >= 0 && sideOf(o) !== R.advSide) {
    const a = R.advSide as Side;
    R.advSide = -1;
    awardFreeKick(m, a, R.advX, R.advY, false);
  }
}

/**
 * The ball is going dead for a `kind` restart to `side`. If advantage was being played for the
 * other side and the ball went out against them, they get their free kick instead. Returns true
 * if it was converted (the free kick has been given).
 */
export function advantageAtDead(m: SpatialMatch, kind: number, side: Side): boolean {
  const R = m.rules;
  if (R.advSide < 0) return false;
  const a = R.advSide as Side;
  R.advSide = -1;
  if (side === a || m.clockMs >= R.advUntil) return false;
  if (kind !== RESTART_THROW_IN && kind !== RESTART_GOAL_KICK && kind !== RESTART_CORNER) return false;
  awardFreeKick(m, a, R.advX, R.advY, false);
  return true;
}

/** A free kick to `side` at (x, y): a quick one in open play, set up near goal. */
export function awardFreeKick(m: SpatialMatch, side: Side, x: number, y: number, indirect: boolean): void {
  const R = m.rules;
  x = clamp(x, 0.5, LENGTH - 0.5);
  y = clamp(y, 0.5, WIDTH - 0.5);
  R.freeKicks[side]++;
  const set = toGoal(side, x, y) <= FK.namedWithin && !inOwnBox(side, x, y);
  goDead(m, RESTART_FREE_KICK, side, set ? FK.setMs : FK.quickMs, x, y);
  R.indirect = indirect;
  setupWall(m);
}

/** A penalty to `side` for the foul on v. */
function awardPenalty(m: SpatialMatch, side: Side, v: number): void {
  const R = m.rules;
  R.penalties[side]++;
  pushEvent(m, 'penalty', v, m.px[v], m.py[v]);
  goDead(m, RESTART_PENALTY, side, PEN.delayMs, depthOf(side, LENGTH - PEN.spot), GC);
  R.indirect = false;
}

// ---------------------------------------------------------------------------
// Sendings-off
// ---------------------------------------------------------------------------

type Num = { [k: number]: number };

function sw(a: Num, i: number, j: number): void {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}

/** Swap everything about the players at indices i and j (the keeper is always index side * 11). */
export function swapPlayers(m: SpatialMatch, i: number, j: number): void {
  const ob = m.onball, R = m.rules, at = m.attack;
  for (const a of [m.px, m.py, m.vx, m.vy, m.tx, m.ty, m.sx, m.sy, m.top, m.acc, m.dist, m.sprint, m.distMark, m.sprintMark,
    m.tight, m.role, m.nextThink, m.delay, m.on, m.who, ob.scanAt, ob.nextScan, ob.scanMs, ob.faceX, ob.faceY, ob.tackleReady,
    ob.touchBlock, R.yellow, R.hurt, R.offFlag, at.runUntil, at.runNext, at.runX, at.runY, at.boxSlot]) sw(a, i, j);
  for (let k = 0; k < ATTRS; k++) { sw(ob.attr, i * ATTRS + k, j * ATTRS + k); sw(m.baseAttr, i * ATTRS + k, j * ATTRS + k); }
  m.at[m.who[i]] = i;
  m.at[m.who[j]] = j;
}

/**
 * Player i is sent off. He leaves the pitch (parked by the halfway line, out of play). A keeper
 * is replaced in goal by the outfielder best at it, and the rest take up the formation's
 * shape for the numbers left.
 */
function sendOff(m: SpatialMatch, i: number, note?: SpatialEvent['note']): void {
  const R = m.rules;
  const side = sideOf(i);
  R.reds[side]++;
  if (note !== 'second') addStoppage(m, T.periods.stoppage.cardS * 1000);
  pushEvent(m, 'red', i, m.px[i], m.py[i], note);
  dropSubsFor(m, m.who[i]);
  m.used[m.who[i]] = 2;
  const base = side * 11;
  const at = m.onball.attr;
  let j = i;
  if (i === base) {
    let best = -1, bv = -1;
    for (let s = 1; s < 11; s++) {
      const k = base + s;
      if (!m.on[k]) continue;
      const v = at[k * ATTRS + A_GKP];
      if (v > bv) { bv = v; best = k; }
    }
    if (best >= 0) { swapPlayers(m, base, best); j = best; }
  }
  m.on[j] = 0;
  R.offFlag[j] = 0;
  R.yellow[j] = 0;
  m.attack.boxSlot[j] = -1;
  m.attack.runUntil[j] = 0;
  const n = R.reds[0] + R.reds[1];
  m.px[j] = PT.halfway + (side === 0 ? -1 : 1) * n * SO.spacing;
  m.py[j] = SO.across;
  m.vx[j] = 0; m.vy[j] = 0;
  m.tx[j] = m.px[j]; m.ty[j] = m.py[j];
  m.role[j] = 0;
  if (m.ball.owner === j) m.ball.owner = -1;
  assignSpots(m, m.teams[side]);
  resolveMarker(m, m.teams[1 - side]);
}

// ---------------------------------------------------------------------------
// Injuries
// ---------------------------------------------------------------------------

/**
 * A challenge between a and v (v more likely the one hurt): maybe somebody picks up a knock.
 * Play stops for it, the side with the ball restarting unopposed. Returns true if play stopped.
 */
export function injuryRoll(m: SpatialMatch, a: number, v: number, mul: number): boolean {
  const R = m.rules;
  const i = m.rng.chance(INJ.victim) ? v : a;
  if (R.hurt[i] || !m.on[i]) return false;
  const p = INJ.perChallenge * (INJ.durBase - m.onball.attr[i * ATTRS + A_DUR] / 99) * mul;
  if (!m.rng.chance(p)) return false;
  R.hurt[i] = 1;
  refreshPlayer(m, i);
  const side = sideOf(i);
  R.injuries[side]++;
  addStoppage(m, T.periods.stoppage.injuryS * 1000);
  pushEvent(m, 'injury', i, m.px[i], m.py[i]);
  if (m.subsUsed[side] >= MAX_SUBS) assignSpots(m, m.teams[side]);
  const b = m.ball;
  if (b.state === BALL_DEAD) {
    m.restartAt += INJ.stopMs;
    return false;
  }
  const ps = (b.owner >= 0 ? sideOf(b.owner) : m.poss) as Side;
  goDead(m, RESTART_DROP, ps, INJ.stopMs + INJ.dropMs, clamp(b.x, 1, LENGTH - 1), clamp(b.y, 1, WIDTH - 1));
  return true;
}

// ---------------------------------------------------------------------------
// Set-piece takers and the wall
// ---------------------------------------------------------------------------

/** The named taker of `side` for `key`, if he is on the pitch (-1 otherwise). */
function named(m: SpatialMatch, side: Side, key: 'penalties' | 'freeKicks' | 'corners'): number {
  const id = m.teams[side].tactics.setPieceTakers[key];
  if (!id) return -1;
  for (let j = side * 11; j < side * 11 + 11; j++) if (m.on[j] && idOf(m, j) === id) return j;
  return -1;
}

/** The outfielder of `side` with the best a1 + a2 (a2 may be -1). */
function bestBy(m: SpatialMatch, side: Side, a1: number, a2: number): number {
  const at = m.onball.attr;
  let best = -1, bv = -Infinity;
  for (let s = 1; s < 11; s++) {
    const j = side * 11 + s;
    if (!m.on[j]) continue;
    const v = at[j * ATTRS + a1] + (a2 >= 0 ? at[j * ATTRS + a2] : 0);
    if (v > bv) { bv = v; best = j; }
  }
  return best;
}

/** The on-pitch player of `side` nearest (x, y), the keeper too if `keeper`. */
export function nearestOf(m: SpatialMatch, side: Side, x: number, y: number, keeper: boolean): number {
  let best = -1, bd2 = Infinity;
  for (let s = keeper ? 0 : 1; s < 11; s++) {
    const i = side * 11 + s;
    if (!m.on[i]) continue;
    const dx = m.px[i] - x, dy = m.py[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd2) { bd2 = d2; best = i; }
  }
  return best;
}

/**
 * The thrower: the full-back on that side in our half, the wide player in theirs, if he is near
 * enough; otherwise whoever is nearest.
 */
function thrower(m: SpatialMatch, side: Side, x: number, y: number): number {
  const team = m.teams[side];
  const left = acrossOf(side, y) < GC;
  const ours = depthOf(side, x) < PT.halfway;
  let best = -1, bv = Infinity;
  for (let s = 1; s < 11; s++) {
    if (!m.on[side * 11 + s]) continue;
    let v: number;
    if (ours) {
      if (team.defU[s] !== 0) continue;
      v = left ? team.defV[s] : 1 - team.defV[s];
    } else {
      if (team.attU[s] < RS.throwerU) continue;
      v = left ? team.attV[s] : 1 - team.attV[s];
    }
    if (v < bv) { bv = v; best = side * 11 + s; }
  }
  if (best >= 0) {
    const dx = m.px[best] - x, dy = m.py[best] - y;
    if (dx * dx + dy * dy <= RS.throwerWithin * RS.throwerWithin) return best;
  }
  return nearestOf(m, side, x, y, false);
}

/** Who takes a `kind` restart for `side` at (x, y). */
export function pickTaker(m: SpatialMatch, kind: number, side: Side, x: number, y: number): number {
  switch (kind) {
    case RESTART_KICKOFF:
      return -1;
    case RESTART_GOAL_KICK:
      return side * 11;
    case RESTART_CORNER: {
      const n = named(m, side, 'corners');
      return n >= 0 ? n : bestBy(m, side, A_SPK, A_CRS);
    }
    case RESTART_THROW_IN:
      return thrower(m, side, x, y);
    case RESTART_PENALTY: {
      const n = named(m, side, 'penalties');
      return n >= 0 ? n : bestBy(m, side, A_SPK, A_CMP);
    }
    case RESTART_FREE_KICK: {
      if (inOwnBox(side, x, y)) return side * 11;
      if (toGoal(side, x, y) <= FK.namedWithin) {
        const n = named(m, side, 'freeKicks');
        return n >= 0 ? n : bestBy(m, side, A_SPK, -1);
      }
      return nearestOf(m, side, x, y, false);
    }
    case RESTART_DROP:
      return inOwnBox(side, x, y) ? side * 11 : nearestOf(m, side, x, y, true);
    default:
      return -1;
  }
}

/** How many in the wall for a free kick `d` m from goal and `e` m across from its centre. */
function wallSize(d: number, e: number): number {
  const W = FK.wallSize;
  let n = 0;
  for (let k = 0; k < W.length; k++) if (d <= W[k][0]) { n = W[k][1]; break; }
  if (n > 2 && (e > FK.wallWide || e < -FK.wallWide)) n = 2;
  return n;
}

/**
 * Line up the wall for the free kick just given: the outer man on the line from the ball to
 * the near post, just outside it, the rest stepping in towards the far post, 9.15 m from the
 * ball. The defenders nearest the spots take them.
 */
export function setupWall(m: SpatialMatch): void {
  const R = m.rules;
  R.nWall = 0;
  if (m.restartKind !== RESTART_FREE_KICK) return;
  const side = m.restartSide;
  const x = m.restartX, y = m.restartY;
  const d = toGoal(side, x, y);
  if (d > FK.wallWithin) return;
  const n = wallSize(d, y - GC);
  if (n <= 0) return;
  const gx = side === 0 ? LENGTH : 0;
  const py = y < GC ? GC - HW : GC + HW;
  let ux = gx - x, uy = py - y;
  const L = Math.sqrt(ux * ux + uy * uy);
  if (L < 1e-9) return;
  ux /= L; uy /= L;
  // In towards the goal centre, square to the line of the near post.
  let qx = 0, qy = GC - py;
  const along = qx * ux + qy * uy;
  qx -= along * ux; qy -= along * uy;
  const ql = Math.sqrt(qx * qx + qy * qy);
  if (ql > 1e-9) { qx /= ql; qy /= ql; } else { qx = -uy; qy = ux; }
  const ox = x + ux * FK.wallDist - qx * FK.wallGap * 0.5;
  const oy = y + uy * FK.wallDist - qy * FK.wallGap * 0.5;
  const def = (1 - side) as Side;
  for (let k = 0; k < n; k++) {
    const wx = ox + qx * FK.wallGap * k, wy = oy + qy * FK.wallGap * k;
    let best = -1, bd2 = Infinity;
    for (let s = 1; s < 11; s++) {
      const j = def * 11 + s;
      if (!m.on[j]) continue;
      let taken = false;
      for (let q = 0; q < R.nWall; q++) if (R.wall[q] === j) taken = true;
      if (taken) continue;
      const dx = m.px[j] - wx, dy = m.py[j] - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd2) { bd2 = d2; best = j; }
    }
    if (best < 0) break;
    R.wall[R.nWall] = best;
    R.wallX[R.nWall] = wx;
    R.wallY[R.nWall] = wy;
    R.nWall++;
  }
}

/** Index of player i in the wall, or -1. */
export function wallSlot(m: SpatialMatch, i: number): number {
  const R = m.rules;
  for (let q = 0; q < R.nWall; q++) if (R.wall[q] === i) return q;
  return -1;
}
