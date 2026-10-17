/**
 * Goals, the ball going out and restarts for the spatial engine (Stage 4.5 build steps 4 and
 * 5): the goal line, kick-offs, goal kicks, corners, throw-ins, free kicks, penalties and
 * dropped balls, and the playback of a planned shot with its block or save. Who takes each
 * restart and the free-kick wall come from rules.ts.
 *
 * A restart's taker can only play the ball (no carrying, and only a direct free kick or a
 * penalty can be a shot), and nobody can tackle him first.
 *
 * Same rules as the rest of the engine: random draws only through m.rng, and only + - * /,
 * Math.sqrt and the det.ts helpers.
 */
import { SPATIAL_TUNING } from '../data';
import { resetAttack } from './attack';
import { detCos, detSin } from './det';
import { control, deflectBehind, startControl } from './onball';
import { advantageAtDead, book, clearOffside, cornerHolding, pickTaker, pushEvent } from './rules';
import { computeSpots, fillRing } from './shape';
import { CROSS_GOAL, CROSS_NONE, CROSS_WOODWORK, classifyCross } from './shot';
import { wasteBooking, wasteMs } from './systems';
import {
  ATTRS, A_HAN, BALL_AIR, BALL_DEAD, BALL_HELD, BALL_ROLL, KICK_NONE, KICK_SHOT, LENGTH, N,
  RESTART_CORNER, RESTART_DROP, RESTART_FREE_KICK, RESTART_GOAL_KICK, RESTART_KICKOFF, RESTART_NONE, RESTART_PENALTY,
  RESTART_THROW_IN, SHOT_KIND_FREE_KICK, SHOT_KIND_PENALTY, SHOT_VALUES, SP_CORNER, SP_DIRECT, SP_GOAL_KICK, SP_INDIRECT,
  PS_SAVES, SP_NONE, SP_PENALTY, SP_THROW, WIDTH, addStoppage, clamp, depthOf, pstatAdd, sideOf, type SpatialMatch,
} from './state';
import { PERIOD, type Side } from './types';

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

/**
 * The ball is out of play: `kind` restart to `side` at (x, y) after `delayMs`. (If advantage
 * was being played for the other side, they get their free kick instead.)
 */
export function goDead(m: SpatialMatch, kind: number, side: Side, delayMs: number, x: number, y: number): void {
  if (advantageAtDead(m, kind, side)) return;
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
  m.restartAt = now + delayMs + wasteMs(m, side, kind, RESTART_KICKOFF);
  m.placeAt = now + RS.placeMs;
  m.restartX = x;
  m.restartY = y;
  m.restartTaker = pickTaker(m, kind, side, x, y);
  m.rules.nWall = 0;
  ob.setPiece = SP_NONE;
  ob.inHands = false;
  clearOffside(m);
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
    for (let i = 0; i < N; i++) if (m.on[i]) { m.px[i] = m.sx[i]; m.py[i] = m.sy[i]; }
  }
  const limit = T.kickoff.ownHalf;
  for (let i = 0; i < N; i++) {
    if (!m.on[i]) continue;
    const s = sideOf(i);
    if (depthOf(s, m.px[i]) > limit) m.px[i] = depthOf(s, limit);
    if (s !== side) keepOff(m, i, 52.5, 34, RS.keepAway);
  }
  // The most advanced player of the kicking side takes it.
  const team = m.teams[side];
  let best = -1;
  for (let s = 1; s < 11; s++) if (m.on[side * 11 + s] && (best < 0 || team.attU[s] > team.attU[best])) best = s;
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
  clearOffside(m);
  m.rules.nWall = 0;
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
  const kind = m.restartKind;
  if (kind === RESTART_KICKOFF) { kickoff(m, side); return; }
  b.x = m.restartX; b.y = m.restartY; b.z = 0;
  let k = m.restartTaker;
  if (k < 0 || !m.on[k]) k = m.restartTaker = pickTaker(m, kind, side, b.x, b.y);
  // Booked for taking too long over it (a second yellow sends him off: somebody else takes it).
  if (kind !== RESTART_PENALTY && k >= 0) {
    const p = wasteBooking(m, side);
    if (p > 0 && m.rng.chance(p) && book(m, k, true)) k = m.restartTaker = pickTaker(m, kind, side, b.x, b.y);
  }
  const ob = m.onball;
  const R = m.rules;
  const o = (1 - side) * 11;
  const own = side === 0 ? 1 : -1;
  if (kind === RESTART_GOAL_KICK || (kind === RESTART_FREE_KICK && k === side * 11)) {
    // Opponents out of the box.
    for (let j = o; j < o + 11; j++) {
      if (!m.on[j]) continue;
      const off = m.py[j] < GC ? GC - m.py[j] : m.py[j] - GC;
      if (depthOf(side, m.px[j]) < PT.boxDepth + 1 && off < PT.boxHalfWidth + 1) m.px[j] = depthOf(side, PT.boxDepth + 1);
    }
  } else if (kind === RESTART_PENALTY) {
    // Everybody but the taker and the keeper out of the box and the arc; the keeper on his line.
    const lim = LENGTH - PT.boxDepth - 1;
    for (let j = 0; j < N; j++) {
      if (!m.on[j] || j === k) continue;
      if (j === o) { m.px[j] = depthOf(side, LENGTH - 0.3); m.py[j] = GC; continue; }
      if (depthOf(side, m.px[j]) > lim) m.px[j] = depthOf(side, lim);
      keepOff(m, j, b.x, b.y, T.penalty.arc);
    }
  } else {
    const r = kind === RESTART_THROW_IN ? RS.throwKeep : kind === RESTART_DROP ? T.injury.dropKeep : RS.keepAway;
    for (let j = o; j < o + 11; j++) if (m.on[j]) keepOff(m, j, b.x, b.y, r);
    // The wall is set.
    for (let q = 0; q < R.nWall; q++) {
      const j = R.wall[q];
      m.px[j] = R.wallX[q]; m.py[j] = R.wallY[q];
      m.vx[j] = 0; m.vy[j] = 0;
    }
  }
  // Holding in the box at a corner.
  if (kind === RESTART_CORNER && cornerHolding(m, side)) return;
  // The taker steps up to it (from the corner flag for a corner, from the touchline for a
  // throw-in, from behind for the rest, with the ball just in front of him).
  if (kind === RESTART_THROW_IN) {
    m.px[k] = b.x;
    m.py[k] = b.y;
    b.y += b.y < GC ? B.dribbleAhead : -B.dribbleAhead;
  } else if (kind === RESTART_CORNER) {
    m.px[k] = clamp(b.x + (b.x > 52.5 ? 1 : -1) * B.dribbleAhead, 0, LENGTH);
    m.py[k] = clamp(b.y + (b.y < GC ? -1 : 1) * B.dribbleAhead, 0, WIDTH);
  } else {
    m.px[k] = clamp(b.x - own * B.dribbleAhead, 0, LENGTH);
    m.py[k] = b.y;
  }
  m.vx[k] = 0; m.vy[k] = 0;
  m.restartKind = RESTART_NONE;
  m.restartTaker = -1;
  ob.lastKick = k;
  control(m, k);
  ob.holdUntil = now;
  ob.show = -1;
  ob.setPiece = kind === RESTART_THROW_IN ? SP_THROW
    : kind === RESTART_CORNER ? SP_CORNER
    : kind === RESTART_GOAL_KICK ? SP_GOAL_KICK
    : kind === RESTART_PENALTY ? SP_PENALTY
    : kind === RESTART_FREE_KICK && !R.indirect ? SP_DIRECT : SP_INDIRECT;
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
  if (m.period < PERIOD.SHOOTOUT) ob.throwIns[side]++;
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
    if (m.period < PERIOD.SHOOTOUT) ob.goalKicks[defenders]++;
    const across = XC[1] < GC ? GC - RS.goalKickAcross : GC + RS.goalKickAcross;
    goDead(m, RESTART_GOAL_KICK, defenders, RS.goalKickMs, depthOf(defenders, PT.sixDepth), across);
  } else cornerTo(m, attackers, line - into * CORNER_IN, XC[1] < GC ? CORNER_IN : WIDTH - CORNER_IN);
  return LINE_DEAD;
}

/** A corner to `side` from (x, y): counted, and logged with its taker. */
export function cornerTo(m: SpatialMatch, side: Side, x: number, y: number): void {
  const live = m.period < PERIOD.SHOOTOUT;
  if (live) m.onball.corners[side]++;
  goDead(m, RESTART_CORNER, side, RS.cornerMs, x, y);
  if (live && m.restartKind === RESTART_CORNER && m.restartTaker >= 0) pushEvent(m, 'corner', m.restartTaker, x, y);
}

/** `side` has scored: who gets it, who made it, and the record. */
function scoreGoal(m: SpatialMatch, side: Side): void {
  // In a shootout the kick was counted when it was struck.
  if (m.period >= PERIOD.SHOOTOUT) return;
  const ob = m.onball;
  m.score[side]++;
  addStoppage(m, T.periods.stoppage.goalS * 1000);
  const R = m.rules;
  const shooter = ob.shooter;
  if (shooter >= 0 && sideOf(shooter) === side) {
    if (R.shotKind === SHOT_KIND_PENALTY) R.penGoals[side]++;
    else if (R.shotKind === SHOT_KIND_FREE_KICK) R.fkGoals[side]++;
    const a = ob.shotAssist;
    m.goalLog.push({ ms: m.clockMs, side, scorer: m.who[shooter], assist: a >= 0 ? m.who[a] : -1, xg: ob.shotXg, ownGoal: false, header: ob.shotHeader });
    return;
  }
  const k = ob.lastKick;
  if (k >= 0 && sideOf(k) !== side) {
    m.goalLog.push({ ms: m.clockMs, side, scorer: m.who[k], assist: -1, xg: 0, ownGoal: true, header: false });
    return;
  }
  // Bundled in without a shot: count it as one, on target.
  ob.shots[side]++;
  ob.onTarget[side]++;
  const a = ob.lastRecv === k ? ob.lastRecvFrom : -1;
  m.goalLog.push({ ms: m.clockMs, side, scorer: k >= 0 ? m.who[k] : -1, assist: a >= 0 ? m.who[a] : -1, xg: 0, ownGoal: false, header: false, bundled: true });
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
  ob.touchBlock[j] = Math.max(ob.touchBlock[j], now + C.retouchMs);
  ob.chaseAt = now;
  m.ball.receiver = -1;
  wakeAll(m);
}

function block(m: SpatialMatch, j: number): void {
  const b = m.ball;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const ux = sp > 1e-9 ? b.vx / sp : 1, uy = sp > 1e-9 ? b.vy / sp : 0;
  const v = sp * m.rng.float(SH.blockSpeed[0], SH.blockSpeed[1]);
  const lift = m.rng.float(SH.blockLift[0], SH.blockLift[1]);
  if (m.rng.chance(SH.blockBehind)) deflectBehind(m, sideOf(j), v, lift);
  else redirect(m, ux, uy, m.rng.normalDet(0, SH.blockSpread), v, lift);
  looseOff(m, j);
}

function save(m: SpatialMatch, j: number): void {
  const b = m.ball;
  const ob = m.onball;
  const side = sideOf(j);
  pstatAdd(m, j, PS_SAVES);
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
    ob.inHands = true;
    return;
  }
  const attackers = (1 - side) as Side;
  if (m.rng.chance(KS.parryOut)) {
    const line = side === 0 ? 0 : LENGTH;
    const into = side === 0 ? -1 : 1;
    cornerTo(m, attackers, line - into * CORNER_IN, b.y < GC ? CORNER_IN : WIDTH - CORNER_IN);
    return;
  }
  // Pushed back out, off to one side.
  const hs = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const ux = hs > 1e-9 ? -b.vx / hs : (side === 0 ? 1 : -1), uy = hs > 1e-9 ? -b.vy / hs : 0;
  const turn = m.rng.float(KS.parryAngle[0], KS.parryAngle[1]) * (m.rng.chance(0.5) ? 1 : -1);
  redirect(m, ux, uy, turn, hs * m.rng.float(KS.parrySpeed[0], KS.parrySpeed[1]), m.rng.float(KS.parryLift[0], KS.parryLift[1]));
  looseOff(m, j);
}
