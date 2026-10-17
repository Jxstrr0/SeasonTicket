/**
 * Goals, the ball going out and restarts for the spatial engine (Stage 4.5 build step 4):
 * the goal line, kick-offs, goal kicks and corners, and the playback of a planned shot with
 * its block or save.
 *
 * Corners and throw-ins are stand-ins until build step 5 brings set pieces: a corner taker
 * plays it like any other ball from the corner, usually a cross; a thrower can only pass, to
 * a team-mate within throwing range, and nobody can tackle him first.
 *
 * Same rules as the rest of the engine: random draws only through m.rng, and only + - * /,
 * Math.sqrt and the det.ts helpers.
 */
import { SPATIAL_TUNING } from '../data';
import { resetAttack } from './attack';
import { detCos, detSin } from './det';
import { control, startControl } from './onball';
import { computeSpots, fillRing } from './shape';
import { CROSS_GOAL, CROSS_NONE, CROSS_WOODWORK, classifyCross } from './shot';
import {
  ATTRS, A_HAN, BALL_AIR, BALL_DEAD, BALL_HELD, BALL_ROLL, KICK_NONE, KICK_SHOT, LENGTH, N,
  RESTART_CORNER, RESTART_GOAL_KICK, RESTART_KICKOFF, RESTART_NONE, RESTART_THROW_IN, SHOT_VALUES, WIDTH,
  clamp, depthOf, sideOf, type SpatialMatch,
} from './state';
import type { Side } from './types';

const T = SPATIAL_TUNING;
const B = T.ball;
const RS = T.restart;
const SH = T.shot;
const KS = T.keeperSave;
const PT = T.pitch;
const C = T.control;
const GC = PT.goalCentreAcross;
const CORNER_IN = 0.3;

/** lineCross results. */
export const LINE_NONE = 0;
export const LINE_DEAD = 1;
export const LINE_WOODWORK = 2;

const XC = new Float64Array(3);

// ---------------------------------------------------------------------------
// Dead balls
// ---------------------------------------------------------------------------

/** Wake everybody up to rethink at once. */
function wakeAll(m: SpatialMatch): void {
  for (let i = 0; i < N; i++) m.nextThink[i] = m.clockMs;
}

/** The corner taker for `side`: the named one if he is on the pitch, else the outfielder nearest the spot. */
function cornerTaker(m: SpatialMatch, side: Side, x: number, y: number): number {
  const players = side === 0 ? m.setup.home.players : m.setup.away.players;
  const id = m.teams[side].tactics.setPieceTakers.corners;
  if (id) for (let s = 1; s < 11; s++) if (players[s].id === id) return side * 11 + s;
  return nearestOutfielder(m, side, x, y);
}

/** The outfielder of `side` nearest (x, y). */
function nearestOutfielder(m: SpatialMatch, side: Side, x: number, y: number): number {
  let best = side * 11 + 1, bd2 = Infinity;
  for (let s = 1; s < 11; s++) {
    const i = side * 11 + s;
    const dx = m.px[i] - x, dy = m.py[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd2) { bd2 = d2; best = i; }
  }
  return best;
}

/** The ball is out of play: `kind` restart to `side` at (x, y) after `delayMs`. */
export function goDead(m: SpatialMatch, kind: number, side: Side, delayMs: number, x: number, y: number): void {
  const b = m.ball;
  const ob = m.onball;
  const now = m.clockMs;
  b.state = BALL_DEAD;
  b.owner = -1;
  b.receiver = -1;
  b.vx = 0; b.vy = 0; b.vz = 0;
  ob.passTarget = -1;
  ob.passKind = KICK_NONE;
  ob.passCross = false;
  ob.chase[0] = -1;
  ob.chase[1] = -1;
  ob.pressured = false;
  ob.entered = false;
  m.restartKind = kind;
  m.restartSide = side;
  m.restartAt = now + delayMs;
  m.placeAt = now + RS.placeMs;
  m.restartX = x;
  m.restartY = y;
  m.restartTaker = kind === RESTART_GOAL_KICK ? side * 11
    : kind === RESTART_CORNER ? cornerTaker(m, side, x, y)
    : kind === RESTART_THROW_IN ? nearestOutfielder(m, side, x, y) : -1;
  if (m.poss !== side) { m.poss = side; m.possChanged = true; }
  for (const t of m.teams) { t.counterUntil = 0; t.counterPressUntil = 0; }
  resetAttack(m);
  wakeAll(m);
}

/** Line both teams up for a kick-off by `side`, and give it to the kicker. */
export function kickoff(m: SpatialMatch, side: Side): void {
  const b = m.ball;
  const ob = m.onball;
  b.x = 52.5; b.y = 34; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0;
  m.focusX = 52.5; m.focusY = 34;
  m.poss = side;
  m.restartKind = RESTART_NONE;
  m.restartTaker = -1;
  m.teams[side].w = 1;
  m.teams[1 - side].w = 0;
  for (const t of m.teams) { t.counterUntil = 0; t.counterPressUntil = 0; t.rush = false; }
  resetAttack(m);
  // Two passes: the in-possession offside cap depends on where the opponents stand.
  for (let pass = 0; pass < 2; pass++) {
    for (const team of m.teams) { fillRing(m, team); computeSpots(m, team); }
    for (let i = 0; i < N; i++) { m.px[i] = m.sx[i]; m.py[i] = m.sy[i]; }
  }
  const limit = T.kickoff.ownHalf;
  for (let i = 0; i < N; i++) {
    const s = sideOf(i);
    if (depthOf(s, m.px[i]) > limit) m.px[i] = depthOf(s, limit);
    if (s !== side) keepOff(m, i, 52.5, 34, RS.keepAway);
  }
  // The most advanced player of the kicking side takes it.
  const team = m.teams[side];
  let best = 1;
  for (let s = 2; s < 11; s++) if (team.attU[s] > team.attU[best]) best = s;
  const kicker = side * 11 + best;
  const dir = side === 0 ? 1 : -1;
  m.px[kicker] = 52.5 - dir * B.dribbleAhead;
  m.py[kicker] = 34;
  b.owner = kicker;
  b.state = BALL_HELD;
  b.receiver = -1;
  b.ox = dir * B.dribbleAhead;
  b.oy = 0;
  for (let i = 0; i < N; i++) {
    m.vx[i] = 0; m.vy[i] = 0;
    m.tx[i] = m.px[i]; m.ty[i] = m.py[i];
    m.nextThink[i] = m.clockMs;
  }
  for (const t of m.teams) fillRing(m, t);
  ob.passTarget = -1;
  ob.passKind = KICK_NONE;
  ob.passCross = false;
  ob.chase[0] = -1;
  ob.chase[1] = -1;
  ob.shooter = -1;
  ob.lastKick = kicker;
  ob.lastRecv = -1;
  ob.entered = false;
  startControl(m, kicker);
}

/** Move player i out to `r` metres from (x, y) if he is closer. */
export function keepOff(m: SpatialMatch, i: number, x: number, y: number, r: number): void {
  const dx = m.px[i] - x, dy = m.py[i] - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= r) return;
  let ux: number, uy: number;
  if (d > 1e-9) { ux = dx / d; uy = dy / d; } else { ux = x < 52.5 ? 1 : -1; uy = 0; }
  m.px[i] = clamp(x + ux * r, 0, LENGTH);
  m.py[i] = clamp(y + uy * r, 0, WIDTH);
}

/** While the ball is dead: put it on its spot after a moment, then take the restart. */
export function restartStep(m: SpatialMatch): void {
  const b = m.ball;
  const now = m.clockMs;
  if (now >= m.placeAt) { b.x = m.restartX; b.y = m.restartY; b.z = 0; }
  if (now < m.restartAt) return;
  const side = m.restartSide;
  if (m.restartKind === RESTART_KICKOFF) { kickoff(m, side); return; }
  const k = m.restartTaker;
  const ob = m.onball;
  const o = (1 - side) * 11;
  if (m.restartKind === RESTART_GOAL_KICK) {
    // Opponents out of the box.
    for (let j = o; j < o + 11; j++) {
      const off = m.py[j] < GC ? GC - m.py[j] : m.py[j] - GC;
      if (depthOf(side, m.px[j]) < PT.boxDepth + 1 && off < PT.boxHalfWidth + 1) m.px[j] = depthOf(side, PT.boxDepth + 1);
    }
  } else {
    const r = m.restartKind === RESTART_THROW_IN ? RS.throwKeep : RS.keepAway;
    for (let j = o; j < o + 11; j++) keepOff(m, j, b.x, b.y, r);
  }
  // The taker steps up to it from behind (from the corner flag for a corner, from the
  // touchline for a throw-in, with the ball just in front of him).
  const thrown = m.restartKind === RESTART_THROW_IN;
  if (m.restartKind === RESTART_GOAL_KICK) {
    m.px[k] = clamp(b.x - (side === 0 ? 1 : -1) * B.dribbleAhead, 0, LENGTH);
    m.py[k] = b.y;
  } else if (thrown) {
    m.px[k] = b.x;
    m.py[k] = b.y;
    b.y += b.y < GC ? B.dribbleAhead : -B.dribbleAhead;
  } else {
    m.px[k] = clamp(b.x + (b.x > 52.5 ? 1 : -1) * B.dribbleAhead, 0, LENGTH);
    m.py[k] = clamp(b.y + (b.y < GC ? -1 : 1) * B.dribbleAhead, 0, WIDTH);
  }
  m.vx[k] = 0; m.vy[k] = 0;
  m.restartKind = RESTART_NONE;
  m.restartTaker = -1;
  ob.lastKick = k;
  control(m, k);
  ob.holdUntil = now;
  ob.throwIn = thrown;
}

// ---------------------------------------------------------------------------
// The touchlines
// ---------------------------------------------------------------------------

/**
 * The ball has just moved from (xa, ya), on the pitch, to over a touchline: a throw-in where
 * it crossed, to the side that did not touch it last.
 */
export function touchCross(m: SpatialMatch, xa: number, ya: number): void {
  const b = m.ball;
  const ob = m.onball;
  const edge = b.y < 0 ? 0 : WIDTH;
  const f = (edge - ya) / (b.y - ya);
  const x = clamp(xa + f * (b.x - xa), 1, LENGTH - 1);
  b.x = x;
  b.y = edge === 0 ? -RS.throwOut : WIDTH + RS.throwOut;
  b.z = 0;
  const k = ob.lastKick;
  const side = (k < 0 ? 1 - m.poss : 1 - sideOf(k)) as Side;
  ob.throwIns[side]++;
  goDead(m, RESTART_THROW_IN, side, RS.throwInMs, x, edge);
}

// ---------------------------------------------------------------------------
// The goal line
// ---------------------------------------------------------------------------

/**
 * The ball has just moved from (xa, ya, za) to where it is now. If that took it over a goal
 * line, score, bounce it off the woodwork or send it out for a goal kick or corner.
 */
export function lineCross(m: SpatialMatch, xa: number, ya: number, za: number): number {
  const b = m.ball;
  const where = classifyCross(xa, ya, za, b.x, b.y, b.z, XC);
  if (where === CROSS_NONE) return LINE_NONE;
  const ob = m.onball;
  const line = XC[0];
  const attackers: Side = line === LENGTH ? 0 : 1;
  const into = attackers === 0 ? 1 : -1;
  if (where === CROSS_WOODWORK) {
    b.x = line - into * 0.05;
    b.y = XC[1];
    b.z = XC[2] > 0 ? XC[2] : 0;
    b.vx = -b.vx * RS.postBounce;
    b.vy *= RS.postBounce;
    b.vz = b.z > 0 ? b.vz * RS.postBounce : 0;
    b.state = b.z > 0 ? BALL_AIR : BALL_ROLL;
    b.receiver = -1;
    ob.passTarget = -1;
    ob.passKind = KICK_NONE;
    ob.passCross = false;
    ob.chaseAt = m.clockMs;
    wakeAll(m);
    return LINE_WOODWORK;
  }
  if (where === CROSS_GOAL) {
    scoreGoal(m, attackers);
    b.x = line + into * RS.netIn;
    b.y = XC[1];
    b.z = 0;
    goDead(m, RESTART_KICKOFF, (1 - attackers) as Side, RS.kickoffMs, 52.5, 34);
    return LINE_DEAD;
  }
  // Out: a goal kick if an attacker touched it last, otherwise a corner.
  b.x = line + into * 0.5;
  b.y = clamp(XC[1], 0, WIDTH);
  b.z = 0;
  const k = ob.lastKick;
  const defenders = (1 - attackers) as Side;
  if (k < 0 || sideOf(k) === attackers) {
    ob.goalKicks[defenders]++;
    const across = XC[1] < GC ? GC - RS.goalKickAcross : GC + RS.goalKickAcross;
    goDead(m, RESTART_GOAL_KICK, defenders, RS.goalKickMs, depthOf(defenders, PT.sixDepth), across);
  } else {
    ob.corners[attackers]++;
    goDead(m, RESTART_CORNER, attackers, RS.cornerMs, line - into * CORNER_IN, XC[1] < GC ? CORNER_IN : WIDTH - CORNER_IN);
  }
  return LINE_DEAD;
}

/** `side` has scored: who gets it, who made it, and the record. */
function scoreGoal(m: SpatialMatch, side: Side): void {
  const ob = m.onball;
  m.score[side]++;
  const shooter = ob.shooter;
  if (shooter >= 0 && sideOf(shooter) === side) {
    m.goalLog.push({ ms: m.clockMs, side, scorer: shooter, assist: ob.shotAssist, xg: ob.shotXg, ownGoal: false, header: ob.shotHeader });
    return;
  }
  const k = ob.lastKick;
  if (k >= 0 && sideOf(k) !== side) {
    m.goalLog.push({ ms: m.clockMs, side, scorer: k, assist: -1, xg: 0, ownGoal: true, header: false });
    return;
  }
  // Bundled in without a shot: count it as one, on target.
  ob.shots[side]++;
  ob.onTarget[side]++;
  m.goalLog.push({ ms: m.clockMs, side, scorer: k, assist: ob.lastRecv === k ? ob.lastRecvFrom : -1, xg: 0, ownGoal: false, header: false });
}

// ---------------------------------------------------------------------------
// Shot playback
// ---------------------------------------------------------------------------

/**
 * Play one step of a planned shot. Returns true if the ball was blocked, saved, went in or
 * went out this step (no other contacts this step); false if the plan ran out or hit the
 * woodwork, which hands the ball back to ordinary physics.
 */
export function shotStep(m: SpatialMatch): boolean {
  const b = m.ball;
  const ob = m.onball;
  const path = ob.shotPath;
  for (let s = 0; s < m.subN; s++) {
    const k = ob.shotK + 1;
    if (k > ob.shotN) { ob.passKind = KICK_NONE; return false; }
    ob.shotK = k;
    const xa = b.x, ya = b.y, za = b.z;
    const o = (k - 1) * SHOT_VALUES;
    b.x = path[o]; b.y = path[o + 1]; b.z = path[o + 2];
    b.vx = path[o + 3]; b.vy = path[o + 4]; b.vz = path[o + 5];
    b.state = path[o + 6];
    if (k === ob.shotEventK) {
      // The touch is part-way along the move.
      const u = ob.shotEventU;
      b.x = xa + u * (b.x - xa); b.y = ya + u * (b.y - ya); b.z = za + u * (b.z - za);
      if (b.z < 0) b.z = 0;
      if (ob.shotEventKind === 1) block(m, ob.shotEventPlayer);
      else save(m, ob.shotEventPlayer);
      return true;
    }
    const r = lineCross(m, xa, ya, za);
    if (r === LINE_DEAD) return true;
    if (r === LINE_WOODWORK) return false;
  }
  return ob.passKind === KICK_SHOT;
}

/** Turn the ball's direction by angle th and set its speed to v. */
function redirect(m: SpatialMatch, ux: number, uy: number, th: number, v: number, lift: number): void {
  const b = m.ball;
  const c = detCos(th), s = detSin(th);
  b.vx = (ux * c - uy * s) * v;
  b.vy = (ux * s + uy * c) * v;
  b.vz = lift;
  b.state = b.z > 0 || lift > 0 ? BALL_AIR : BALL_ROLL;
}

/** The ball is loose after player j got something on it. */
function looseOff(m: SpatialMatch, j: number): void {
  const ob = m.onball;
  const now = m.clockMs;
  ob.passKind = KICK_NONE;
  ob.lastKick = j;
  ob.lastTouch = j;
  ob.touchAt = now;
  ob.touchBlock[j] = now + C.retouchMs;
  ob.chaseAt = now;
  m.ball.receiver = -1;
  wakeAll(m);
}

function block(m: SpatialMatch, j: number): void {
  const b = m.ball;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const ux = sp > 1e-9 ? b.vx / sp : 1, uy = sp > 1e-9 ? b.vy / sp : 0;
  const v = sp * m.rng.float(SH.blockSpeed[0], SH.blockSpeed[1]);
  redirect(m, ux, uy, m.rng.normalDet(0, SH.blockSpread), v, m.rng.float(SH.blockLift[0], SH.blockLift[1]));
  looseOff(m, j);
}

function save(m: SpatialMatch, j: number): void {
  const b = m.ball;
  const ob = m.onball;
  const side = sideOf(j);
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  // How far he had to go for it, against the most he could reach.
  const dx = b.x - m.px[j], dy = b.y - m.py[j];
  const up = b.z > KS.standHigh ? b.z - KS.standHigh : 0;
  const e = Math.sqrt(dx * dx + dy * dy + up * up);
  const stretch = clamp(e / (KS.reach0 + KS.diveV * KS.diveT), 0, 1);
  const speedF = clamp((sp - SH.speed[0]) / (SH.speed[1] - SH.speed[0]), 0, 1);
  // He gets across to it.
  const dh = Math.sqrt(dx * dx + dy * dy);
  if (dh > B.dribbleAhead) {
    m.px[j] = b.x - (dx / dh) * B.dribbleAhead;
    m.py[j] = b.y - (dy / dh) * B.dribbleAhead;
  }
  const hold = clamp(KS.holdBase + (KS.holdHan * ob.attr[j * ATTRS + A_HAN]) / 99 - KS.holdSpeed * speedF - KS.holdStretch * stretch, 0.05, 0.95);
  if (m.rng.chance(hold)) {
    ob.passKind = KICK_NONE;
    control(m, j);
    return;
  }
  const attackers = (1 - side) as Side;
  if (m.rng.chance(KS.parryOut)) {
    ob.corners[attackers]++;
    const line = side === 0 ? 0 : LENGTH;
    const into = side === 0 ? -1 : 1;
    goDead(m, RESTART_CORNER, attackers, RS.cornerMs, line - into * CORNER_IN, b.y < GC ? CORNER_IN : WIDTH - CORNER_IN);
    return;
  }
  // Pushed back out, off to one side.
  const hs = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const ux = hs > 1e-9 ? -b.vx / hs : (side === 0 ? 1 : -1), uy = hs > 1e-9 ? -b.vy / hs : 0;
  const turn = m.rng.float(KS.parryAngle[0], KS.parryAngle[1]) * (m.rng.chance(0.5) ? 1 : -1);
  redirect(m, ux, uy, turn, hs * m.rng.float(KS.parrySpeed[0], KS.parrySpeed[1]), m.rng.float(KS.parryLift[0], KS.parryLift[1]));
  looseOff(m, j);
}
