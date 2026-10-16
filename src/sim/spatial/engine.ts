/**
 * The spatial match engine (Stage 4.5): 22 players and a ball on a 105 m by 68 m pitch,
 * stepped at a fixed rate. Build step 2 covers team shape, pressing, movement and ball
 * physics; the ball itself is moved by a temporary script (script.ts).
 *
 * Determinism: every random draw comes from one seeded Rng, time is whole milliseconds,
 * and only + - * /, Math.sqrt and rounding are used, so the same seed and the same list
 * of actions give the same match, step for step, in every browser. Matches are replayed
 * from that record instead of storing position frames.
 */
import { SPATIAL_TUNING } from '../data';
import { Rng } from '../rng';
import type { Tactics } from '../types';
import { flightSubstep, loftTable } from './ball';
import { movePlayers } from './move';
import { counterTarget, coverTarget, markTarget, presserTarget, updatePress } from './press';
import { onControl, scriptStep } from './script';
import { applyTeamTactics, computeSpots, currentLine, currentOffCap, fillRing, resolveMarker, writeAnchors } from './shape';
import {
  ANCHORS, BALL_AIR, BALL_FROZEN, BALL_HELD, BALL_ROLL, LENGTH, N, RING, WIDTH,
  acrossOf, clamp, depthOf, sideOf, type SpatialMatch, type TeamState,
} from './state';
import {
  FRAME_VALUES, ROLE, type Side, type SpatialAction, type SpatialMode, type SpatialRecord,
  type SpatialSetup, type TeamShapeInfo,
} from './types';

const T = SPATIAL_TUNING;
const B = T.ball;
const MATCH_MS = 90 * 60 * 1000;

function copyTactics(t: Tactics): Tactics {
  return { ...t, setPieceTakers: { ...t.setPieceTakers } };
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
  };
}

/** Start a match. `actions` (from a record) are applied at their times, for replays. */
export function createSpatial(setup: SpatialSetup, seed: string, mode: SpatialMode = 'fine', actions: SpatialAction[] = []): SpatialMatch {
  const stepMs = mode === 'fine' ? T.time.fineStepMs : T.time.coarseStepMs;
  const stepS = stepMs / 1000;
  const subN = Math.ceil(stepMs / (T.time.ballSubstepS * 1000));
  const subH = stepS / subN;
  const sides = [setup.home, setup.away];
  for (const s of sides) if (s.players.length !== 11) throw new Error('Each side needs eleven players');
  const m: SpatialMatch = {
    rev: T.engineRev,
    seed,
    mode,
    setup,
    stepMs,
    stepS,
    subH,
    subN,
    steps: 0,
    clockMs: 0,
    endMs: MATCH_MS,
    rng: new Rng(`spatial:${seed}`),
    loft: loftTable(subH),
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
    role: new Uint8Array(N),
    nextThink: new Float64Array(N),
    delay: new Int32Array(N),
    teams: [newTeam(0, setup.home.tactics), newTeam(1, setup.away.tactics)],
    ball: { x: 52.5, y: 34, z: 0, vx: 0, vy: 0, vz: 0, state: BALL_HELD, owner: -1, receiver: -1, meetX: 0, meetY: 0, strikeMs: 0, arriveMs: 0, ox: 0.6, oy: 0 },
    focusX: 52.5,
    focusY: 34,
    poss: 0,
    possChanged: false,
    script: { holdUntil: 0, carryX: 0, carryY: 0 },
    pending: actions.map((a) => ({ ...a, tactics: copyTactics(a.tactics) })).sort((a, b) => a.ms - b.ms),
    actions: actions.map((a) => ({ ...a, tactics: copyTactics(a.tactics) })),
  };
  const MV = T.move;
  const SO = T.shapeOut;
  for (let i = 0; i < N; i++) {
    const p = sides[sideOf(i)].players[i % 11];
    const a = p.attributes;
    m.top[i] = MV.topBase + (MV.topPace * a.pac) / 99;
    m.acc[i] = MV.accBase + (MV.accPace * a.pac) / 99;
    const reaction = SO.reactionSlowest - (SO.reactionGain * (a.pos + a.mrk)) / 198;
    m.delay[i] = Math.min(RING - 1, Math.max(0, Math.round(reaction / stepS)));
  }
  applyTeamTactics(m, m.teams[0], setup.home.tactics);
  applyTeamTactics(m, m.teams[1], setup.away.tactics);
  resolveMarker(m, m.teams[0]);
  resolveMarker(m, m.teams[1]);
  kickoff(m, 0);
  return m;
}

/** Line both teams up for a kick-off by `side`. */
function kickoff(m: SpatialMatch, side: Side): void {
  const b = m.ball;
  b.x = 52.5; b.y = 34; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0;
  m.focusX = 52.5; m.focusY = 34;
  m.poss = side;
  m.teams[side].w = 1;
  m.teams[1 - side].w = 0;
  // Two passes: the in-possession offside cap depends on where the opponents stand.
  for (let pass = 0; pass < 2; pass++) {
    for (const team of m.teams) { fillRing(m, team); computeSpots(m, team); }
    for (let i = 0; i < N; i++) { m.px[i] = m.sx[i]; m.py[i] = m.sy[i]; }
  }
  const limit = T.script.kickoffOwnHalf;
  for (let i = 0; i < N; i++) {
    const s = sideOf(i);
    const d = depthOf(s, m.px[i]);
    if (d > limit) m.px[i] = depthOf(s, limit);
    if (s !== side) {
      const dx = m.px[i] - 52.5;
      const dy = m.py[i] - 34;
      const r = Math.sqrt(dx * dx + dy * dy);
      const keep = 9.15 + 0.5;
      if (r < keep) {
        const ux = r > 1e-9 ? dx / r : (s === 0 ? -1 : 1);
        const uy = r > 1e-9 ? dy / r : 0;
        m.px[i] = 52.5 + ux * keep;
        m.py[i] = 34 + uy * keep;
      }
    }
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
  onControl(m, kicker);
}

// ---------------------------------------------------------------------------
// Possession
// ---------------------------------------------------------------------------

function setPossession(m: SpatialMatch, side: Side): void {
  if (side === m.poss) return;
  const loser = m.teams[m.poss];
  const winner = m.teams[side];
  const now = m.clockMs;
  m.poss = side;
  m.possChanged = true;
  loser.counterPressUntil = now + T.press.counterPress[loser.tactics.pressing - 1] * 1000;
  loser.counterUntil = 0;
  winner.counterPressUntil = 0;
  winner.counterUntil = winner.tactics.counterAttack ? now + T.counter.seconds * 1000 : 0;
  for (let i = 0; i < N; i++) m.nextThink[i] = now;
}

function control(m: SpatialMatch, i: number): void {
  const b = m.ball;
  b.state = BALL_HELD;
  b.owner = i;
  b.receiver = -1;
  b.z = 0;
  b.vz = 0;
  const ox = b.x - m.px[i];
  const oy = b.y - m.py[i];
  const r = Math.sqrt(ox * ox + oy * oy);
  if (r > 1e-9) { b.ox = (ox / r) * B.dribbleAhead; b.oy = (oy / r) * B.dribbleAhead; }
  else { b.ox = (sideOf(i) === 0 ? 1 : -1) * B.dribbleAhead; b.oy = 0; }
  m.nextThink[i] = m.clockMs;
  setPossession(m, sideOf(i));
  onControl(m, i);
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

function airFor(m: SpatialMatch): void {
  const b = m.ball;
  const h = m.subH;
  for (let k = 0; k < m.subN; k++) {
    if (b.state === BALL_ROLL) { rollFor(b, h * (m.subN - k)); return; }
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
  }
}

/** Closest distance from point (px, py) to the segment (ax, ay)-(bx, by). */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const sx = bx - ax;
  const sy = by - ay;
  const L2 = sx * sx + sy * sy;
  let f = L2 > 1e-12 ? ((px - ax) * sx + (py - ay) * sy) / L2 : 0;
  f = clamp(f, 0, 1);
  const dx = px - (ax + f * sx);
  const dy = py - (ay + f * sy);
  return Math.sqrt(dx * dx + dy * dy);
}

function ballStep(m: SpatialMatch): void {
  const b = m.ball;
  if (b.state === BALL_FROZEN || b.state === BALL_HELD) return;
  const x0 = b.x;
  const y0 = b.y;
  if (b.state === BALL_ROLL) rollFor(b, m.stepS);
  else airFor(m);
  if (b.x < 0) { b.x = 0; if (b.vx < 0) b.vx = 0; } else if (b.x > LENGTH) { b.x = LENGTH; if (b.vx > 0) b.vx = 0; }
  if (b.y < 0) { b.y = 0; if (b.vy < 0) b.vy = 0; } else if (b.y > WIDTH) { b.y = WIDTH; if (b.vy > 0) b.vy = 0; }
  const r = b.receiver;
  if (r >= 0 && b.z < B.controlHeight && segmentDistance(m.px[r], m.py[r], x0, y0, b.x, b.y) <= B.controlReach) {
    control(m, r);
    return;
  }
  if (m.clockMs >= b.arriveMs + B.giveUpAfter * 1000) {
    // Nobody got there: the nearest player goes for it.
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < N; i++) {
      const dx = m.px[i] - b.x;
      const dy = m.py[i] - b.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (r >= 0) m.nextThink[r] = m.clockMs;
    b.receiver = best;
    b.arriveMs = m.clockMs;
    m.nextThink[best] = m.clockMs;
  }
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
  m.focusX += (gx - m.focusX) * k;
  m.focusY += (gy - m.focusY) * k;
}

// ---------------------------------------------------------------------------
// Roles and targets
// ---------------------------------------------------------------------------

function decideRole(m: SpatialMatch, i: number): number {
  const side = sideOf(i);
  const slot = i - side * 11;
  const team = m.teams[side];
  const b = m.ball;
  if (i === b.owner) return ROLE.CARRY;
  if (i === b.receiver) return ROLE.RECEIVE;
  if (slot === 0) return ROLE.KEEPER;
  if (m.poss !== side) {
    if (team.pressSet.includes(i)) return ROLE.PRESS;
    if (i === team.coverIdx) return ROLE.COVER;
    if (slot === team.markerSlot && team.markTarget >= 0) return ROLE.MARK;
    return ROLE.SHAPE;
  }
  if (m.clockMs < team.counterUntil && team.counterSlots.includes(slot) ) return ROLE.COUNTER;
  return ROLE.SHAPE;
}

const tmp = new Float64Array(2);

function targetFor(m: SpatialMatch, i: number): void {
  const side = sideOf(i);
  const slot = i - side * 11;
  const team = m.teams[side];
  const b = m.ball;
  let x = m.sx[i];
  let y = m.sy[i];
  switch (m.role[i]) {
    case ROLE.CARRY:
      if (b.owner === i) { x = m.script.carryX; y = m.script.carryY; }
      break;
    case ROLE.RECEIVE:
      if (b.receiver === i) {
        if (m.clockMs < b.arriveMs) { x = b.meetX; y = b.meetY; } else { x = b.x; y = b.y; }
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
    case ROLE.COUNTER:
      if (m.clockMs < team.counterUntil) { counterTarget(team, slot, currentOffCap(team, m.steps), tmp); x = tmp[0]; y = tmp[1]; }
      break;
  }
  m.tx[i] = x;
  m.ty[i] = y;
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
    applyTeamTactics(m, m.teams[a.side], a.tactics);
    resolveMarker(m, m.teams[0]);
    resolveMarker(m, m.teams[1]);
    for (let i = a.side * 11; i < a.side * 11 + 11; i++) m.nextThink[i] = m.clockMs;
  }
}

/** Advance one step. Returns false once the match is over. */
export function stepSpatial(m: SpatialMatch): boolean {
  if (m.clockMs >= m.endMs) return false;
  m.possChanged = false;
  while (m.pending.length > 0 && m.pending[0].ms <= m.clockMs) applyAction(m, m.pending.shift() as SpatialAction);
  ballStep(m);
  if (m.ball.state !== BALL_FROZEN) scriptStep(m);
  updateFocus(m);
  const blend = m.stepS / T.blendSeconds;
  for (const team of m.teams) {
    const goal = m.poss === team.side ? 1 : 0;
    team.w = goal > team.w ? Math.min(goal, team.w + blend) : Math.max(goal, team.w - blend);
    writeAnchors(m, team, m.steps);
  }
  computeSpots(m, m.teams[0]);
  computeSpots(m, m.teams[1]);
  updatePress(m, m.teams[1 - m.poss]);
  updatePress(m, m.teams[m.poss]);
  rethink(m);
  for (let i = 0; i < N; i++) targetFor(m, i);
  turnCut(m);
  movePlayers(m);
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

/** Change one side's tactics. Takes effect at the start of the next whole second. */
export function queueTactics(m: SpatialMatch, side: Side, tactics: Tactics): SpatialAction {
  const ms = (Math.floor(m.clockMs / 1000) + 1) * 1000;
  const action: SpatialAction = { ms, side, type: 'tactics', tactics: copyTactics(tactics) };
  m.actions.push(action);
  const queued = { ...action, tactics: copyTactics(tactics) };
  let k = m.pending.length;
  while (k > 0 && m.pending[k - 1].ms > ms) k--;
  m.pending.splice(k, 0, queued);
  return action;
}

export function spatialRecord(m: SpatialMatch): SpatialRecord {
  return {
    rev: m.rev,
    seed: m.seed,
    mode: m.mode,
    setup: m.setup,
    actions: m.actions.map((a) => ({ ...a, tactics: copyTactics(a.tactics) })),
  };
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
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Read-outs and test hooks
// ---------------------------------------------------------------------------

/** Test hook: pin the ball in place with `possSide` in possession. Turns the ball script off. */
export function freezeBall(m: SpatialMatch, x: number, y: number, possSide: Side): void {
  const b = m.ball;
  b.state = BALL_FROZEN;
  b.owner = -1;
  b.receiver = -1;
  b.x = x; b.y = y; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0;
  m.poss = possSide;
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

export { BALL_AIR, BALL_FROZEN, BALL_HELD, BALL_ROLL };
