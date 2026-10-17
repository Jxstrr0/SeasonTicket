/**
 * The spatial match engine (Stage 4.5): 22 players and a ball on a 105 m by 68 m pitch,
 * stepped at a fixed rate. Build steps 2 to 4 cover team shape, pressing, movement, ball
 * physics, on-ball play (passing, carrying, first touches, tackles and loose balls:
 * onball.ts), attacking runs and filling the box (attack.ts), shots, blocks and saves
 * (shot.ts), and goals, goal kicks, corners and kick-offs (restart.ts).
 *
 * Determinism: every random draw comes from one seeded Rng, time is whole milliseconds,
 * and only + - * /, Math.sqrt and rounding are used, so the same seed and the same list
 * of actions give the same match, step for step, in every browser. Matches are replayed
 * from that record instead of storing position frames.
 */
import { SPATIAL_TUNING } from '../data';
import { Rng } from '../rng';
import type { Tactics } from '../types';
import { boxPoint, createAttack, updateAttack } from './attack';
import { flightSubstep, loftTable, loftTableAt } from './ball';
import { movePlayers } from './move';
import { counterTarget, coverTarget, markTarget, presserTarget, trackTarget, updatePress, updateTracking } from './press';
import { BALL_PATH, BALL_PATH_N, MET_BY, ballContacts, clearOfPath, createOnBall, initOnBall, metBeforeLine, onBallStep, receiveTarget } from './onball';
import { createRules, inOwnBox, rulesStep, wallSlot } from './rules';
import { LINE_DEAD, kickoff, lineCross, restartStep, shotStep, touchCross } from './restart';
import { applyTeamTactics, computeSpots, currentLine, currentOffCap, resolveMarker, writeAnchors } from './shape';
import { applySubs, assignSpots, cancelSub, initEnergy, loadPerson, periodStep, queueSub, secondTick, shootoutStep } from './systems';
import {
  ANCHORS, ATTRS, BALL_AIR, BALL_DEAD, BALL_FROZEN, BALL_HELD, BALL_ROLL, KICK_SHOT, LENGTH, N, PSTATS, RESTART_CORNER, RESTART_DROP,
  RESTART_FREE_KICK, RESTART_GOAL_KICK, RESTART_KICKOFF, RESTART_PENALTY, RESTART_THROW_IN, RING, SP_NONE, WIDTH, acrossOf, clamp, depthOf, sideOf, type SpatialMatch, type TeamState,
} from './state';
import {
  BENCH_MAX, FRAME_VALUES, PERIOD, PERSONS, ROLE, type Side, type SpatialAction, type SpatialMode, type SpatialRecord,
  type SpatialSetup, type TeamShapeInfo,
} from './types';

const T = SPATIAL_TUNING;
const B = T.ball;

function copyTactics(t: Tactics): Tactics {
  return { ...t, setPieceTakers: { ...t.setPieceTakers } };
}

function copyAction(a: SpatialAction): SpatialAction {
  return a.type === 'tactics' ? { ...a, tactics: copyTactics(a.tactics) } : { ...a };
}

function newTeam(side: Side, tactics: Tactics): TeamState {
  return {
    side,
    tactics: copyTactics(tactics),
    formation: { id: '', name: '', slots: [], defensiveBias: 0 },
    defU: new Float64Array(11),
    defV: new Float64Array(11),
    attU: new Float64Array(11),
    attV: new Float64Array(11),
    isBehind: new Uint8Array(11),
    counterSlots: [],
    markerSlot: -1,
    markTarget: -1,
    ring: new Float64Array(RING * ANCHORS),
    w: 0,
    pressCarrier: -1,
    pressEngaged: false,
    pressStartMs: 0,
    pressRestUntil: 0,
    counterPressUntil: 0,
    pressSet: [],
    coverIdx: -1,
    pressAdv: 0,
    counterUntil: 0,
    track: new Int32Array(11).fill(-1),
    spot: Int8Array.from({ length: 11 }, (_, k) => k),
    rush: false,
  };
}

/** Start a match. `actions` (from a record) are applied at their times, for replays. */
export function createSpatial(setup: SpatialSetup, seed: string, mode: SpatialMode = 'fine', actions: SpatialAction[] = []): SpatialMatch {
  const stepMs = mode === 'fine' ? T.time.fineStepMs : T.time.coarseStepMs;
  const stepS = stepMs / 1000;
  const subN = Math.ceil(stepMs / (T.time.ballSubstepS * 1000));
  const subH = stepS / subN;
  const sides = [setup.home, setup.away];
  for (const s of sides) {
    if (s.players.length !== 11) throw new Error('Each side needs eleven players');
    if ((s.bench?.length ?? 0) > BENCH_MAX) throw new Error(`A bench holds at most ${BENCH_MAX}`);
  }
  const m: SpatialMatch = {
    rev: T.engineRev,
    seed,
    mode,
    setup,
    stepMs,
    stepS,
    crowd: setup.crowd == null ? 0 : T.home.attendanceFloor + (1 - T.home.attendanceFloor) * Math.min(1, Math.max(0, setup.crowd)),
    subH,
    subN,
    steps: 0,
    clockMs: 0,
    rng: new Rng(`spatial:${seed}`),
    period: PERIOD.FIRST,
    periodStart: 0,
    added: -1,
    stoppageMs: 0,
    periodLog: [],
    nextSecond: 1000,
    energy: new Float64Array(PERSONS),
    periodEnergy: new Float64Array(PERSONS),
    at: new Int8Array(PERSONS).fill(-1),
    used: new Uint8Array(PERSONS),
    pstat: new Float64Array(PERSONS * PSTATS),
    subQ: [],
    subsUsed: new Int32Array(2),
    baseAttr: new Float64Array(N * ATTRS),
    distMark: new Float64Array(N),
    sprintMark: new Float64Array(N),
    shootout: null,
    loft: loftTable(subH),
    crossLoft: loftTableAt(subH, T.cross.deg),
    px: new Float64Array(N),
    py: new Float64Array(N),
    vx: new Float64Array(N),
    vy: new Float64Array(N),
    tx: new Float64Array(N),
    ty: new Float64Array(N),
    sx: new Float64Array(N),
    sy: new Float64Array(N),
    top: new Float64Array(N),
    acc: new Float64Array(N),
    dist: new Float64Array(N),
    sprint: new Float64Array(N),
    tight: new Float64Array(N),
    role: new Uint8Array(N),
    nextThink: new Float64Array(N),
    delay: new Int32Array(N),
    on: new Uint8Array(N).fill(1),
    who: Int32Array.from({ length: N }, (_, k) => k),
    teams: [newTeam(0, setup.home.tactics), newTeam(1, setup.away.tactics)],
    ball: { x: 52.5, y: 34, z: 0, vx: 0, vy: 0, vz: 0, state: BALL_HELD, owner: -1, receiver: -1, meetX: 0, meetY: 0, strikeMs: 0, arriveMs: 0, ox: 0.6, oy: 0 },
    focusX: 52.5,
    focusY: 34,
    poss: 0,
    possChanged: false,
    onball: createOnBall(),
    attack: createAttack(),
    rules: createRules(),
    score: new Int32Array(2),
    shotLog: [],
    goalLog: [],
    events: [],
    restartKind: 0,
    restartSide: 0,
    restartAt: 0,
    placeAt: 0,
    restartX: 52.5,
    restartY: 34,
    restartTaker: -1,
    pending: actions.map(copyAction).sort((a, b) => a.ms - b.ms),
    actions: actions.map(copyAction),
  };
  initEnergy(m);
  for (let i = 0; i < N; i++) loadPerson(m, i, i);
  applyTeamTactics(m, m.teams[0], setup.home.tactics);
  applyTeamTactics(m, m.teams[1], setup.away.tactics);
  resolveMarker(m, m.teams[0]);
  resolveMarker(m, m.teams[1]);
  initOnBall(m);
  kickoff(m, 0);
  return m;
}

// ---------------------------------------------------------------------------
// Ball
// ---------------------------------------------------------------------------

const flight = new Float64Array(6);

function rollFor(b: SpatialMatch['ball'], dt: number): void {
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (sp <= 0) return;
  const ns = Math.max(0, sp - B.rollDecel * dt);
  const adv = ns > 0 ? ((sp + ns) / 2) * dt : (sp * sp) / (2 * B.rollDecel);
  const ux = b.vx / sp;
  const uy = b.vy / sp;
  b.x += ux * adv;
  b.y += uy * adv;
  b.vx = ux * ns;
  b.vy = uy * ns;
}

/** Adds where the ball is now to this step's flight path (BALL_PATH). */
function pathPoint(b: SpatialMatch['ball']): void {
  const n = BALL_PATH_N[0];
  if (n * 6 >= BALL_PATH.length) return;
  const o = n * 6;
  BALL_PATH[o] = b.x; BALL_PATH[o + 1] = b.y; BALL_PATH[o + 2] = b.z;
  BALL_PATH[o + 3] = b.vx; BALL_PATH[o + 4] = b.vy; BALL_PATH[o + 5] = b.vz;
  BALL_PATH_N[0] = n + 1;
}

/** Fly the ball for one step. Returns true if it went dead on the way (a goal or out of play). */
function airFor(m: SpatialMatch): boolean {
  const b = m.ball;
  const h = m.subH;
  pathPoint(b);
  for (let k = 0; k < m.subN; k++) {
    const xa = b.x, ya = b.y, za = b.z;
    if (b.state === BALL_ROLL) {
      rollFor(b, h * (m.subN - k));
      pathPoint(b);
      return !metBeforeLine(m, xa, ya, za) && lineCross(m, xa, ya, za) === LINE_DEAD;
    }
    flight[0] = b.x; flight[1] = b.y; flight[2] = b.z;
    flight[3] = b.vx; flight[4] = b.vy; flight[5] = b.vz;
    flightSubstep(flight, h);
    if (flight[2] <= 0) {
      const f = b.z / (b.z - flight[2]);
      b.x += f * (flight[0] - b.x);
      b.y += f * (flight[1] - b.y);
      b.z = 0;
      const vz = flight[5];
      if (-vz < B.rollBelowVz) {
        b.vx = flight[3]; b.vy = flight[4]; b.vz = 0;
        b.state = BALL_ROLL;
      } else {
        b.vx = flight[3] * B.bounceForward;
        b.vy = flight[4] * B.bounceForward;
        b.vz = -vz * B.bounceVertical;
      }
    } else {
      b.x = flight[0]; b.y = flight[1]; b.z = flight[2];
      b.vx = flight[3]; b.vy = flight[4]; b.vz = flight[5];
    }
    pathPoint(b);
    if (metBeforeLine(m, xa, ya, za)) return false;
    if (lineCross(m, xa, ya, za) === LINE_DEAD) return true;
  }
  return false;
}

function ballStep(m: SpatialMatch): void {
  const b = m.ball;
  BALL_PATH_N[0] = 0;
  MET_BY[0] = -1;
  if (b.state === BALL_FROZEN || b.state === BALL_HELD || b.state === BALL_DEAD) return;
  const x0 = b.x;
  const y0 = b.y;
  if (m.onball.passKind === KICK_SHOT) {
    // A shot follows its plan; nobody else touches it.
    if (shotStep(m) || b.state === BALL_DEAD) return;
  } else if (b.state === BALL_ROLL) {
    rollFor(b, m.stepS);
    if (!metBeforeLine(m, x0, y0, 0) && lineCross(m, x0, y0, 0) === LINE_DEAD) return;
  } else if (airFor(m)) return;
  if (b.y < 0 || b.y > WIDTH) { touchCross(m, x0, y0); return; }
  if (b.state === BALL_HELD || m.onball.passKind === KICK_SHOT) return;
  ballContacts(m, x0, y0);
}

function ballFollowsCarrier(m: SpatialMatch): void {
  const b = m.ball;
  if (b.state !== BALL_HELD || b.owner < 0) return;
  const i = b.owner;
  const vx = m.vx[i];
  const vy = m.vy[i];
  const sp = Math.sqrt(vx * vx + vy * vy);
  if (sp > 0.3) { b.ox = (vx / sp) * B.dribbleAhead; b.oy = (vy / sp) * B.dribbleAhead; }
  b.x = clamp(m.px[i] + b.ox, 0, LENGTH);
  b.y = clamp(m.py[i] + b.oy, 0, WIDTH);
  b.z = 0;
  b.vx = vx;
  b.vy = vy;
  b.vz = 0;
}

/** Ease the focus point towards the ball, or towards where a pass is going. */
function updateFocus(m: SpatialMatch): void {
  const b = m.ball;
  const travelling = (b.state === BALL_ROLL || b.state === BALL_AIR) && b.receiver >= 0 && m.clockMs < b.arriveMs;
  const gx = travelling ? b.meetX : b.x;
  const gy = travelling ? b.meetY : b.y;
  const k = Math.min(1, m.stepS / T.focusSeconds);
  let fx = (gx - m.focusX) * k;
  let fy = (gy - m.focusY) * k;
  // A team shifts across the pitch at a run, not at the speed of the ball.
  const f = Math.sqrt(fx * fx + fy * fy);
  const cap = T.focusMaxSpeed * m.stepS;
  if (f > cap) { fx *= cap / f; fy *= cap / f; }
  m.focusX += fx;
  m.focusY += fy;
}

// ---------------------------------------------------------------------------
// Roles and targets
// ---------------------------------------------------------------------------

function decideRole(m: SpatialMatch, i: number): number {
  const side = sideOf(i);
  const slot = i - side * 11;
  const team = m.teams[side];
  const b = m.ball;
  if (!m.on[i]) return ROLE.SHAPE;
  if (b.state === BALL_DEAD) {
    if (i === m.restartTaker) return ROLE.CARRY;
    if (m.restartKind === RESTART_FREE_KICK && wallSlot(m, i) >= 0) return ROLE.WALL;
    if (slot === 0) return ROLE.KEEPER;
    if (m.attack.boxSlot[i] >= 0) return ROLE.BOX;
    if (m.restartSide !== side && team.track[slot] >= 0) return ROLE.TRACK;
    return ROLE.SHAPE;
  }
  if (i === b.owner) return ROLE.CARRY;
  if (i === b.receiver) return ROLE.RECEIVE;
  if (m.onball.chase[side] === i) return ROLE.RECEIVE;
  if (m.onball.show === i && m.onball.setPiece !== SP_NONE && b.owner >= 0) return ROLE.RECEIVE;
  if (m.onball.passTarget === i && (b.state === BALL_ROLL || b.state === BALL_AIR)) return ROLE.RECEIVE;
  if (slot === 0) return ROLE.KEEPER;
  if (m.poss !== side) {
    if (team.pressSet.includes(i)) return ROLE.PRESS;
    if (i === team.coverIdx) return ROLE.COVER;
    if (slot === team.markerSlot && team.markTarget >= 0) return ROLE.MARK;
    if (team.track[slot] >= 0) return ROLE.TRACK;
    return ROLE.SHAPE;
  }
  if (m.clockMs < m.attack.runUntil[i]) return ROLE.RUN;
  if (m.attack.boxSlot[i] >= 0) return ROLE.BOX;
  if (m.clockMs < team.counterUntil && team.counterSlots.includes(slot) ) return ROLE.COUNTER;
  return ROLE.SHAPE;
}

const tmp = new Float64Array(2);

function targetFor(m: SpatialMatch, i: number): void {
  const side = sideOf(i);
  const slot = i - side * 11;
  const team = m.teams[side];
  const b = m.ball;
  // Sent off: he stays where he was parked.
  if (!m.on[i]) { m.tx[i] = m.px[i]; m.ty[i] = m.py[i]; return; }
  let x = m.sx[i];
  let y = m.sy[i];
  switch (m.role[i]) {
    case ROLE.WALL: {
      const q = wallSlot(m, i);
      if (q >= 0) { m.tx[i] = m.rules.wallX[q]; m.ty[i] = m.rules.wallY[q]; return; }
      break;
    }
    case ROLE.CARRY:
      if (b.owner === i) { x = m.onball.carryX; y = m.onball.carryY; }
      else if (b.state === BALL_DEAD && i === m.restartTaker) { x = m.restartX; y = m.restartY; }
      break;
    case ROLE.RECEIVE:
      if (b.receiver === i || (m.onball.passTarget === i && (b.state === BALL_ROLL || b.state === BALL_AIR))) {
        receiveTarget(m, i, tmp); x = tmp[0]; y = tmp[1];
      } else if (m.onball.chase[side] === i) { x = m.onball.chaseX[side]; y = m.onball.chaseY[side]; }
      else if (m.onball.show === i && b.owner >= 0) {
        // Coming short: to showDist from the ball, on his side of it.
        const dx = m.px[i] - b.x, dy = m.py[i] - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > T.restart.showDist) {
          x = clamp(b.x + (dx / d) * T.restart.showDist, 1, LENGTH - 1);
          y = clamp(b.y + (dy / d) * T.restart.showDist, 1, WIDTH - 1);
        } else { x = m.px[i]; y = m.py[i]; }
      }
      break;
    case ROLE.PRESS: {
      const k = team.pressEngaged ? team.pressSet.indexOf(i) : -1;
      if (k >= 0) { presserTarget(m, team, k, tmp); x = tmp[0]; y = tmp[1]; }
      break;
    }
    case ROLE.COVER:
      if (team.pressEngaged && team.coverIdx === i) { coverTarget(m, team, tmp); x = tmp[0]; y = tmp[1]; }
      break;
    case ROLE.MARK:
      if (m.poss !== side && team.markTarget >= 0 && slot === team.markerSlot) { markTarget(m, team, tmp); x = tmp[0]; y = tmp[1]; }
      break;
    case ROLE.TRACK:
      if (m.poss !== side && team.track[slot] >= 0) { trackTarget(m, team, slot, tmp); x = tmp[0]; y = tmp[1]; }
      break;
    case ROLE.COUNTER:
      if (m.clockMs < team.counterUntil) { counterTarget(team, slot, currentOffCap(team, m.steps), tmp); x = tmp[0]; y = tmp[1]; }
      break;
    case ROLE.RUN:
      if (m.clockMs < m.attack.runUntil[i]) { x = m.attack.runX[i]; y = m.attack.runY[i]; }
      break;
    case ROLE.BOX:
      if (boxPoint(m, i, tmp)) {
        x = tmp[0]; y = tmp[1];
        // Wait on the offside line until the ball is on its way in.
        const inFlight = (b.state === BALL_AIR || b.state === BALL_ROLL) && m.onball.passCross;
        const cap = currentOffCap(team, m.steps);
        if (!inFlight && (b.state !== BALL_DEAD || m.restartKind === RESTART_FREE_KICK) && depthOf(side, x) > cap) x = depthOf(side, cap);
      }
      break;
  }
  if (b.state === BALL_DEAD) { deadBallSpot(m, i, side, x, y, tmp); x = tmp[0]; y = tmp[1]; }
  m.tx[i] = x;
  m.ty[i] = y;
}

/** Where the laws let player i of `side` stand for the restart being waited for, given where he wants to go. */
function deadBallSpot(m: SpatialMatch, i: number, side: Side, x: number, y: number, out: Float64Array): void {
  const kind = m.restartKind;
  const kick = m.restartSide;
  let cx = -1, cy = 0;
  if (kind === RESTART_PENALTY && i !== m.restartTaker) {
    // The defending keeper on his line; everybody else out of the box and the arc.
    if (i === (1 - kick) * 11) { out[0] = depthOf(kick, LENGTH - 0.3); out[1] = T.pitch.goalCentreAcross; return; }
    const lim = LENGTH - T.pitch.boxDepth - 1;
    if (depthOf(kick, x) > lim) x = depthOf(kick, lim);
    cx = m.restartX; cy = m.restartY;
  }
  if (kind === RESTART_KICKOFF) {
    const lim = T.kickoff.ownHalf;
    if (depthOf(side, x) > lim) x = depthOf(side, lim);
    if (side !== kick) { cx = 52.5; cy = 34; }
  } else if (kind === RESTART_GOAL_KICK) {
    const off = y < 34 ? 34 - y : y - 34;
    if (side !== kick && depthOf(kick, x) < T.pitch.boxDepth + 1 && off < T.pitch.boxHalfWidth + 1) x = depthOf(kick, T.pitch.boxDepth + 1);
  } else if ((kind === RESTART_CORNER || kind === RESTART_THROW_IN || kind === RESTART_FREE_KICK || kind === RESTART_DROP) && side !== kick) {
    cx = m.restartX; cy = m.restartY;
    // A free kick in his own box: the opponents wait outside it too.
    if (kind === RESTART_FREE_KICK && inOwnBox(kick, cx, cy)) {
      const off = y < 34 ? 34 - y : y - 34;
      if (depthOf(kick, x) < T.pitch.boxDepth + 1 && off < T.pitch.boxHalfWidth + 1) x = depthOf(kick, T.pitch.boxDepth + 1);
    }
  }
  if (cx >= 0) {
    const r = kind === RESTART_THROW_IN ? T.restart.throwKeep : kind === RESTART_DROP ? T.injury.dropKeep
      : kind === RESTART_PENALTY ? T.penalty.arc + 0.5 : T.restart.keepAway;
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < r) {
      const ux = d > 1e-9 ? dx / d : (cx < 52.5 ? 1 : -1), uy = d > 1e-9 ? dy / d : 0;
      x = clamp(cx + ux * r, 0, LENGTH);
      y = clamp(cy + uy * r, 0, WIDTH);
    }
  }
  out[0] = x;
  out[1] = y;
}

const rethought = new Uint8Array(N);

function rethink(m: SpatialMatch): void {
  const now = m.clockMs;
  const RT = m.mode === 'fine' ? T.time.rethinkMs.fine : T.time.rethinkMs.coarse;
  const near2 = T.time.nearBall * T.time.nearBall;
  for (let i = 0; i < N; i++) {
    rethought[i] = 0;
    if (now < m.nextThink[i]) continue;
    rethought[i] = 1;
    m.role[i] = decideRole(m, i);
    const dx = m.px[i] - m.ball.x;
    const dy = m.py[i] - m.ball.y;
    const interval = i % 11 === 0 ? RT[2] : dx * dx + dy * dy <= near2 ? RT[0] : RT[1];
    m.nextThink[i] = now + interval;
  }
}

/** A player who decides to turn back on himself loses some speed first. */
function turnCut(m: SpatialMatch): void {
  const MV = T.move;
  const keep = 1 - MV.turnSlow;
  const minV2 = MV.turnMinSpeed * MV.turnMinSpeed;
  for (let i = 0; i < N; i++) {
    if (!rethought[i]) continue;
    const vx = m.vx[i], vy = m.vy[i];
    if (vx * vx + vy * vy <= minV2) continue;
    if (vx * (m.tx[i] - m.px[i]) + vy * (m.ty[i] - m.py[i]) < 0) { m.vx[i] = vx * keep; m.vy[i] = vy * keep; }
  }
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

function applyAction(m: SpatialMatch, a: SpatialAction): void {
  if (a.type === 'tactics') {
    const team = m.teams[a.side];
    const was = team.formation.id;
    applyTeamTactics(m, team, a.tactics);
    // A new formation: everyone to the slot that suits him best.
    if (team.formation.id !== was) assignSpots(m, team);
    resolveMarker(m, m.teams[0]);
    resolveMarker(m, m.teams[1]);
    for (let i = a.side * 11; i < a.side * 11 + 11; i++) m.nextThink[i] = m.clockMs;
  } else if (a.type === 'sub') queueSub(m, a.side, a.outId, a.inId);
  else cancelSub(m, a.side, a.outId);
}

/** Advance one step. Returns false once the match is over. */
export function stepSpatial(m: SpatialMatch): boolean {
  if (!periodStep(m)) return false;
  m.possChanged = false;
  while (m.pending.length > 0 && m.pending[0].ms <= m.clockMs) applyAction(m, m.pending.shift() as SpatialAction);
  secondTick(m);
  ballStep(m);
  shootoutStep(m);
  if (m.ball.state === BALL_DEAD) {
    applySubs(m, false);
    restartStep(m);
  }
  updateAttack(m);
  onBallStep(m);
  rulesStep(m);
  updateFocus(m);
  // A team that loses the ball gets back into its defensive shape faster than one that wins
  // it spreads out.
  const win = m.stepS / T.blendSeconds[0], lose = m.stepS / T.blendSeconds[1];
  for (const team of m.teams) {
    const goal = m.poss === team.side ? 1 : 0;
    team.w = goal > team.w ? Math.min(goal, team.w + win) : Math.max(goal, team.w - lose);
    writeAnchors(m, team, m.steps);
  }
  computeSpots(m, m.teams[0]);
  computeSpots(m, m.teams[1]);
  updatePress(m, m.teams[1 - m.poss]);
  updatePress(m, m.teams[m.poss]);
  updateTracking(m, m.teams[1 - m.poss]);
  updateTracking(m, m.teams[m.poss]);
  rethink(m);
  for (let i = 0; i < N; i++) targetFor(m, i);
  turnCut(m);
  movePlayers(m);
  clearOfPath(m);
  ballFollowsCarrier(m);
  m.steps++;
  m.clockMs += m.stepMs;
  return true;
}

export function runUntil(m: SpatialMatch, ms: number): void {
  while (m.clockMs < ms && stepSpatial(m)) { /* keep stepping */ }
}

export function runSeconds(m: SpatialMatch, seconds: number): void {
  runUntil(m, m.clockMs + Math.round(seconds * 1000));
}

// ---------------------------------------------------------------------------
// Inputs, record and replay
// ---------------------------------------------------------------------------

/** Queue an input for the start of the next whole second, and keep it for the record. */
function queueAction(m: SpatialMatch, action: SpatialAction): SpatialAction {
  m.actions.push(action);
  const queued = copyAction(action);
  let k = m.pending.length;
  while (k > 0 && m.pending[k - 1].ms > action.ms) k--;
  m.pending.splice(k, 0, queued);
  return action;
}

function nextSecond(m: SpatialMatch): number {
  return (Math.floor(m.clockMs / 1000) + 1) * 1000;
}

/** Change one side's tactics. Takes effect at the start of the next whole second. */
export function queueTactics(m: SpatialMatch, side: Side, tactics: Tactics): SpatialAction {
  return queueAction(m, { ms: nextSecond(m), side, type: 'tactics', tactics: copyTactics(tactics) });
}

/**
 * Ask for a substitution (player ids). From the next whole second it waits for the ball to
 * go dead; a substitution that is not allowed then is ignored.
 */
export function queueSubstitution(m: SpatialMatch, side: Side, outId: string, inId: string): SpatialAction {
  return queueAction(m, { ms: nextSecond(m), side, type: 'sub', outId, inId });
}

/** Take back a substitution that has not been made yet. */
export function queueCancelSub(m: SpatialMatch, side: Side, outId: string): SpatialAction {
  return queueAction(m, { ms: nextSecond(m), side, type: 'cancelSub', outId });
}

export function spatialRecord(m: SpatialMatch): SpatialRecord {
  return {
    rev: m.rev,
    seed: m.seed,
    mode: m.mode,
    setup: m.setup,
    actions: m.actions.map(copyAction),
  };
}

/** The match is over (after full time, extra time or the shootout). */
export function spatialFinished(m: SpatialMatch): boolean {
  return m.period === PERIOD.DONE;
}

/** Write the current positions (centimetres) into `out` at `offset`. */
export function captureFrame(m: SpatialMatch, out: Int16Array, offset = 0): void {
  let p = offset;
  for (let i = 0; i < N; i++) {
    out[p++] = Math.round(m.px[i] * 100);
    out[p++] = Math.round(m.py[i] * 100);
  }
  out[p++] = Math.round(m.ball.x * 100);
  out[p++] = Math.round(m.ball.y * 100);
  out[p] = Math.round(m.ball.z * 100);
}

/** Rebuild the frames between two match times from a record alone. One frame per step. */
export function replayFrames(record: SpatialRecord, fromSecond: number, toSecond: number): Int16Array {
  const m = createSpatial(record.setup, record.seed, record.mode, record.actions);
  const from = fromSecond * 1000;
  const to = toSecond * 1000;
  const count = Math.max(0, Math.ceil((to - Math.max(0, from)) / m.stepMs));
  const out = new Int16Array(count * FRAME_VALUES);
  let k = 0;
  while (m.clockMs < to && k < count) {
    if (m.clockMs >= from) { captureFrame(m, out, k * FRAME_VALUES); k++; }
    if (!stepSpatial(m)) break;
  }
  return k === count ? out : out.slice(0, k * FRAME_VALUES);
}

const fpBuf = new Float64Array(1);
const fpWords = new Uint32Array(fpBuf.buffer);

/** A short hash of the whole moving state, for determinism checks. */
export function fingerprint(m: SpatialMatch): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    fpBuf[0] = v;
    h = Math.imul(h ^ fpWords[0], 16777619);
    h = Math.imul(h ^ fpWords[1], 16777619);
  };
  for (let i = 0; i < N; i++) { mix(m.px[i]); mix(m.py[i]); mix(m.vx[i]); mix(m.vy[i]); mix(m.role[i]); }
  const b = m.ball;
  mix(b.x); mix(b.y); mix(b.z); mix(b.vx); mix(b.vy); mix(b.vz); mix(b.state); mix(b.owner); mix(b.receiver);
  mix(m.focusX); mix(m.focusY); mix(m.poss); mix(m.clockMs); mix(m.rng.getState());
  const ob = m.onball;
  mix(ob.decideAt); mix(ob.chase[0]); mix(ob.chase[1]); mix(ob.passTarget);
  mix(m.score[0]); mix(m.score[1]); mix(m.period); mix(m.subsUsed[0]); mix(m.subsUsed[1]);
  for (let i = 0; i < N; i++) mix(m.energy[m.who[i]]);
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Read-outs and test hooks
// ---------------------------------------------------------------------------

/** Test hook: pin the ball in place with `possSide` in possession. Turns on-ball logic off. */
export function freezeBall(m: SpatialMatch, x: number, y: number, possSide: Side): void {
  const b = m.ball;
  b.state = BALL_FROZEN;
  b.owner = -1;
  b.receiver = -1;
  b.x = x; b.y = y; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0;
  m.poss = possSide;
  m.onball.chase[0] = -1;
  m.onball.chase[1] = -1;
  m.onball.passTarget = -1;
  m.onball.passKind = 0;
  for (const t of m.teams) {
    t.counterUntil = 0;
    t.counterPressUntil = 0;
    t.pressCarrier = -1;
    t.pressEngaged = false;
    t.pressSet = [];
    t.coverIdx = -1;
    t.pressAdv = 0;
  }
  for (let i = 0; i < N; i++) m.nextThink[i] = m.clockMs;
}

export function teamShapeInfo(m: SpatialMatch, side: Side): TeamShapeInfo {
  const team = m.teams[side];
  let backSum = 0, backN = 0;
  let dMin = Infinity, dMax = -Infinity, aMin = Infinity, aMax = -Infinity;
  for (let s = 1; s < 11; s++) {
    const i = side * 11 + s;
    if (!m.on[i]) continue;
    const d = depthOf(side, m.px[i]);
    const a = acrossOf(side, m.py[i]);
    if (team.defU[s] === 0) { backSum += d; backN++; }
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
    if (a < aMin) aMin = a;
    if (a > aMax) aMax = a;
  }
  const last = (m.steps + RING - 1) % RING;
  return {
    backLine: backN > 0 ? backSum / backN : 0,
    targetLine: currentLine(team, last),
    length: dMax - dMin,
    width: aMax - aMin,
  };
}

export function playerRole(m: SpatialMatch, i: number): number {
  return m.role[i];
}

/** Players in each side's press right now (global indices), for the viewer. */
export function pressingPlayers(m: SpatialMatch, side: Side): readonly number[] {
  const t = m.teams[side];
  return t.pressEngaged ? t.pressSet : [];
}

/** The man-marker and his target (global indices), or null. */
export function markingPair(m: SpatialMatch, side: Side): [number, number] | null {
  const t = m.teams[side];
  if (t.markTarget < 0 || t.markerSlot < 0 || m.poss === side) return null;
  return [side * 11 + t.markerSlot, t.markTarget];
}

export { BALL_AIR, BALL_DEAD, BALL_FROZEN, BALL_HELD, BALL_ROLL };
export { matchStats, type SideStats } from './onball';
