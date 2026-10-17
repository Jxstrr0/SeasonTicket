/**
 * Match systems for the spatial engine (Stage 4.5 build step 6, docs/DESIGN.md 17.7): the
 * periods (stoppage time, half-time, extra time and the shootout), substitutions, fatigue,
 * time-wasting and the shapes of a side down to ten or nine.
 *
 * Same rules as the rest of the engine: random draws only through m.rng, and only + - * /,
 * Math.sqrt and rounding. Periods, substitutions and the shootout are rare and may allocate;
 * the once-a-second fatigue update does not.
 */
import { MATCH_TUNING, SPATIAL_TUNING } from '../data';
import { positionFit } from '../match/lineup';
import type { Position } from '../types';
import { initPlayerOnBall } from './onball';
import { goDead, kickoff } from './restart';
import { clearOffside, pickTaker, pushEvent, swapPlayers } from './rules';
import { applyTeamTactics, resolveMarker } from './shape';
import {
  ATTRS, A_AGG, A_CMP, A_CRS, A_DRI, A_DUR, A_FIN, A_GKP, A_HAN, A_HEA, A_KCK, A_PAC, A_PAS, A_POS, A_REF, A_SPK, A_STA, A_STR,
  A_TCK, A_VIS, A_WRK, BALL_DEAD, KICK_SHOT, N, PSTATS, PS_DIST, PS_SECS, PS_SPRINT, RESTART_PENALTY, SP_NONE, SP_PENALTY,
  LENGTH, RING, addStoppage, depthOf, type SpatialMatch, type TeamState,
} from './state';
import { BENCH_BASE, PERIOD, personOf, whoOf, whoSide, type ShootoutState, type Side, type SpatialPlayer } from './types';

const T = SPATIAL_TUNING;
const MT = MATCH_TUNING;
const MV = T.move;
const SO = T.shapeOut;
const INJ = T.injury;
const PD = T.periods;
const ST = PD.stoppage;
const SB = T.subs;
const FT = T.fatigue;
const TW = T.timeWasting;
const SHOOT = MT.shootout;
const FP = MT.attributes.fatiguePenalty;
const MIN_E = MT.fatigue.minEnergy;
const MIN_START = MT.fatigue.minStartEnergy;
const HALF_MS = MT.clock.halfMinutes * 60000;
const ET_HALF_MS = MT.clock.extraHalfMinutes * 60000;
const MAX_SUBS = MT.squad.maxSubs;
const GC = T.pitch.goalCentreAcross;
const WHISTLE = ['half', 'full', 'etHalf', 'etFull'] as const;
/** The attributes home advantage lifts: technical and mental, not physical. */
const HOME_ATTRS = [A_PAS, A_VIS, A_CMP, A_POS, A_DRI, A_TCK, A_HEA, A_KCK, A_FIN, A_CRS, A_REF, A_HAN, A_GKP, A_SPK];

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/** Put person w at index i: his attributes, pace, marking and reactions. */
export function loadPerson(m: SpatialMatch, i: number, w: number): void {
  const p = personOf(m.setup, w) as SpatialPlayer;
  const a = p.attributes;
  m.who[i] = w;
  m.at[w] = i;
  m.used[w] = 1;
  const b = m.baseAttr;
  const o = i * ATTRS;
  b[o + A_PAS] = a.pas; b[o + A_VIS] = a.vis; b[o + A_CMP] = a.cmp; b[o + A_POS] = a.pos;
  b[o + A_DRI] = a.dri; b[o + A_STR] = a.str; b[o + A_TCK] = a.tck; b[o + A_HEA] = a.hea;
  b[o + A_KCK] = a.kck; b[o + A_PAC] = a.pac; b[o + A_AGG] = a.agg; b[o + A_FIN] = a.fin;
  b[o + A_CRS] = a.crs; b[o + A_REF] = a.ref; b[o + A_HAN] = a.han; b[o + A_GKP] = a.gkp;
  b[o + A_WRK] = a.wrk; b[o + A_SPK] = a.spk; b[o + A_DUR] = a.dur; b[o + A_STA] = a.sta;
  const SS = T.skillSpread;
  for (let k = 0; k < ATTRS; k++) b[o + k] = SS.pivot + SS.keep * (b[o + k] - SS.pivot);
  if (i < 11 && m.crowd > 0) {
    const up = T.home.attrPoints * m.crowd;
    for (const k of HOME_ATTRS) b[o + k] = Math.min(99, b[o + k] + up);
  }
  m.tight[i] = T.track.tightBase + (T.track.tightGain * a.mrk) / 99;
  const reaction = SO.reactionSlowest - (SO.reactionGain * (a.pos + a.mrk)) / 198;
  m.delay[i] = Math.min(RING - 1, Math.max(0, Math.round(reaction / m.stepS)));
  refreshPlayer(m, i);
}

/** Recompute the attributes, top speed and acceleration of the player at index i from his energy and any knock. */
export function refreshPlayer(m: SpatialMatch, i: number): void {
  const f = 1 - FP * (1 - m.energy[m.who[i]]);
  const o = i * ATTRS;
  const b = m.baseAttr, at = m.onball.attr;
  for (let k = 0; k < ATTRS; k++) at[o + k] = k === A_AGG ? b[o + k] : b[o + k] * f;
  const pac = at[o + A_PAC];
  const hurt = m.rules.hurt[i] ? INJ.speed : 1;
  m.top[i] = (MV.topBase + (MV.topPace * pac) / 99) * hurt;
  m.acc[i] = (MV.accBase + (MV.accPace * pac) / 99) * hurt;
}

/** Energy at kick-off for person w, from the setup (1 if not given). */
function startEnergy(m: SpatialMatch, w: number): number {
  const side = whoSide(w);
  const s = side === 0 ? m.setup.home : m.setup.away;
  const k = w < BENCH_BASE ? w % 11 : 11 + ((w - BENCH_BASE) % 9);
  const e = s.energy?.[k];
  return e === undefined ? 1 : Math.max(MIN_START, Math.min(1, e));
}

export function initEnergy(m: SpatialMatch): void {
  for (let w = 0; w < m.energy.length; w++) {
    m.energy[w] = personOf(m.setup, w) ? startEnergy(m, w) : 0;
    m.periodEnergy[w] = m.energy[w];
  }
}

/**
 * Once a second: everyone on the pitch tires by what he ran and sprinted, his minutes and
 * distance are counted, and his attributes follow his energy.
 */
export function secondTick(m: SpatialMatch): void {
  if (m.clockMs < m.nextSecond) return;
  m.nextSecond += 1000;
  const weather = m.setup.weather ? MT.weather[m.setup.weather].fatigue : 1;
  const counting = m.period < PERIOD.SHOOTOUT;
  for (let i = 0; i < N; i++) {
    if (!m.on[i]) continue;
    const w = m.who[i];
    const dd = m.dist[i] - m.distMark[i];
    const ds = m.sprint[i] - m.sprintMark[i];
    m.distMark[i] = m.dist[i];
    m.sprintMark[i] = m.sprint[i];
    if (counting) {
      const o = w * PSTATS;
      m.pstat[o + PS_SECS] += 1;
      m.pstat[o + PS_DIST] += dd;
      m.pstat[o + PS_SPRINT] += ds;
    }
    const sta = m.baseAttr[i * ATTRS + A_STA];
    const base = i % 11 === 0 ? FT.baseS * FT.keeperBase : FT.baseS;
    const drain = (base + FT.perM * dd + FT.perSprintM * ds) * (FT.staBase - (FT.staGain * sta) / 99) * weather;
    const e = m.energy[w] - drain;
    m.energy[w] = e < MIN_E ? MIN_E : e;
    refreshPlayer(m, i);
  }
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** Engine time a period's regular time runs for. */
export function periodLength(period: number): number {
  return period < PERIOD.ET_FIRST ? HALF_MS : ET_HALF_MS;
}

/** A period may not end with a penalty waiting or a shot on its way. */
function canEnd(m: SpatialMatch): boolean {
  const ob = m.onball;
  if (ob.passKind === KICK_SHOT || ob.setPiece === SP_PENALTY) return false;
  return !(m.ball.state === BALL_DEAD && m.restartKind === RESTART_PENALTY);
}

/** Show the stoppage time: what the referee kept, in whole minutes. */
function announce(m: SpatialMatch): void {
  const s = ST.baseS + m.stoppageMs / 1000;
  const lim = m.period < PERIOD.ET_FIRST ? ST.regulation : ST.extraTime;
  const v = Math.round(s / 60 + m.rng.normalDet(0, ST.sd));
  m.added = v < lim[0] ? lim[0] : v > lim[1] ? lim[1] : v;
}

/**
 * Called at the start of each step: put the board up when the regular time is gone, and
 * end the period once the stoppage is played. Returns false once the match is over.
 */
export function periodStep(m: SpatialMatch): boolean {
  if (m.period >= PERIOD.SHOOTOUT) return m.period !== PERIOD.DONE;
  const el = m.clockMs - m.periodStart;
  const reg = periodLength(m.period);
  if (m.added < 0) {
    if (el < reg) return true;
    announce(m);
  }
  if (el < reg + m.added * 60000 || !canEnd(m)) return true;
  endPeriod(m);
  return m.period !== PERIOD.DONE;
}

function whistle(m: SpatialMatch, side: Side, note: (typeof WHISTLE)[number] | 'shootout'): void {
  m.events.push({ ms: m.clockMs, kind: 'whistle', side, player: -1, x: m.ball.x, y: m.ball.y, note });
}

function endPeriod(m: SpatialMatch): void {
  const p = m.period;
  m.periodLog.push({ period: p, startMs: m.periodStart, endMs: m.clockMs, added: m.added });
  whistle(m, 0, WHISTLE[p]);
  const level = m.score[0] === m.score[1];
  let next: number;
  if (p === PERIOD.FIRST) next = PERIOD.SECOND;
  else if (p === PERIOD.SECOND) next = m.setup.extraTime && level ? PERIOD.ET_FIRST : PERIOD.DONE;
  else if (p === PERIOD.ET_FIRST) next = PERIOD.ET_SECOND;
  else next = level ? PERIOD.SHOOTOUT : PERIOD.DONE;
  // The break: some of the energy used in the period comes back.
  const rec = PD.recover[p];
  for (let i = 0; i < N; i++) {
    if (!m.on[i]) continue;
    const w = m.who[i];
    if (m.periodEnergy[w] > m.energy[w]) m.energy[w] += rec * (m.periodEnergy[w] - m.energy[w]);
  }
  m.period = next;
  m.periodStart = m.clockMs;
  m.added = -1;
  m.stoppageMs = 0;
  m.periodEnergy.set(m.energy);
  if (next === PERIOD.DONE) {
    m.ball.state = BALL_DEAD;
    m.ball.owner = -1;
    return;
  }
  m.rules.advSide = -1;
  clearOffside(m);
  m.onball.setPiece = SP_NONE;
  m.onball.inHands = false;
  applySubs(m, true);
  for (let i = 0; i < N; i++) if (m.on[i]) refreshPlayer(m, i);
  if (next === PERIOD.SHOOTOUT) startShootout(m);
  else kickoff(m, next === PERIOD.SECOND || next === PERIOD.ET_SECOND ? 1 : 0);
}

/** Match time of an engine time: period, minute (1-based as shown: 45 in first-half stoppage), stoppage minute, seconds. */
export function matchTime(m: SpatialMatch, ms: number): { period: number; minute: number; added: number; seconds: number } {
  // The period this moment fell in: a finished one from the log, else the one being played.
  let period = m.period, start = m.periodStart;
  const log = m.periodLog;
  let k = 0;
  while (k < log.length && ms > log[k].endMs) k++;
  if (k < log.length) { period = log[k].period; start = log[k].startMs; }
  else if (m.period === PERIOD.DONE && log.length > 0) { period = log[k - 1].period; start = log[k - 1].startMs; }
  if (period >= PERIOD.SHOOTOUT) return { period, minute: MT.clock.shootoutMinute, added: 0, seconds: 0 };
  const base = [0, 45, 90, 105][period] * 60000;
  const el = Math.max(0, ms - start);
  const reg = periodLength(period);
  const shown = base + Math.min(el, reg);
  const over = el > reg ? el - reg : 0;
  return {
    period,
    minute: Math.min(Math.floor(shown / 60000) + 1, base / 60000 + reg / 60000),
    added: over > 0 ? Math.floor(over / 60000) + 1 : 0,
    seconds: Math.floor((base + el) / 1000),
  };
}

/** The clock as shown on a scoreboard: "37:12", "45+2:10", "ET 97:03", "Pens" or "FT". */
export function clockLabel(m: SpatialMatch): string {
  if (m.period === PERIOD.DONE) return 'FT';
  if (m.period === PERIOD.SHOOTOUT) return 'Pens';
  const base = [0, 45, 90, 105][m.period] * 60;
  const el = Math.floor((m.clockMs - m.periodStart) / 1000);
  const reg = periodLength(m.period) / 1000;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const t = el <= reg ? mmss(base + el) : `${(base + reg) / 60}+${mmss(el - reg)}`;
  return m.period >= PERIOD.ET_FIRST ? `ET ${t}` : t;
}

// ---------------------------------------------------------------------------
// Time-wasting
// ---------------------------------------------------------------------------

/** Seconds (as ms) `side` adds to a restart of `kind` by wasting time; counted as stoppage. */
export function wasteMs(m: SpatialMatch, side: Side, kind: number, kickoffKind: number): number {
  if (kind === kickoffKind || kind === RESTART_PENALTY || m.period >= PERIOD.SHOOTOUT) return 0;
  const ms = TW.addS[m.teams[side].tactics.timeWasting - 1] * 1000;
  addStoppage(m, ms);
  return ms;
}

/** The chance the taker of `side`'s restart is booked for wasting time (0 means no draw). */
export function wasteBooking(m: SpatialMatch, side: Side): number {
  return m.period >= PERIOD.SHOOTOUT ? 0 : TW.booking[m.teams[side].tactics.timeWasting - 1];
}

// ---------------------------------------------------------------------------
// Substitutions
// ---------------------------------------------------------------------------

/** Queue a substitution (ids); ignored unless it is allowed. Returns true if queued. */
export function queueSub(m: SpatialMatch, side: Side, outId: string, inId: string): boolean {
  if (m.period >= PERIOD.SHOOTOUT || m.subsUsed[side] >= MAX_SUBS) return false;
  const out = whoOf(m.setup, side, outId);
  const inn = whoOf(m.setup, side, inId);
  if (out < 0 || inn < BENCH_BASE || m.used[inn] !== 0) return false;
  const i = m.at[out];
  if (i < 0 || !m.on[i]) return false;
  for (const q of m.subQ) if (q.out === out || q.in === inn) return false;
  m.subQ.push({ side, out, in: inn });
  m.subsUsed[side]++;
  return true;
}

/** Take a queued substitution back (the player going off, by id). */
export function cancelSub(m: SpatialMatch, side: Side, outId: string): void {
  const out = whoOf(m.setup, side, outId);
  const k = m.subQ.findIndex((q) => q.out === out && q.side === side);
  if (k < 0) return;
  m.subQ.splice(k, 1);
  m.subsUsed[side]--;
}

/** Drop any substitution queued for person w (he has been sent off), giving it back. */
export function dropSubsFor(m: SpatialMatch, w: number): void {
  for (let k = m.subQ.length - 1; k >= 0; k--) {
    const q = m.subQ[k];
    if (q.out !== w) continue;
    m.subQ.splice(k, 1);
    m.subsUsed[q.side]--;
  }
}

/** Make the queued substitutions (the ball is dead, or it is half-time). */
export function applySubs(m: SpatialMatch, interval: boolean): void {
  if (m.subQ.length === 0) return;
  const q = m.subQ.splice(0, m.subQ.length);
  for (const s of q) {
    const i = m.at[s.out];
    if (i < 0 || !m.on[i]) { m.subsUsed[s.side]--; continue; }
    substitute(m, s.side, i, s.in);
    if (!interval) {
      m.restartAt += SB.delayMs;
      addStoppage(m, ST.subS * 1000);
    }
  }
}

function substitute(m: SpatialMatch, side: Side, i: number, inn: number): void {
  const base = side * 11;
  const incoming = personOf(m.setup, inn) as SpatialPlayer;
  let j = i;
  // A keeper coming on for an outfielder while an outfielder is in goal: the stand-in goes
  // back out to the place of the man coming off, and the keeper goes in goal.
  if (incoming.position === 'GK' && i !== base && m.on[base] && (personOf(m.setup, m.who[base]) as SpatialPlayer).position !== 'GK') {
    swapPlayers(m, base, i);
    j = base;
  }
  const out = m.who[j];
  pushEvent(m, 'sub', j, m.px[j], m.py[j], undefined, inn);
  m.at[out] = -1;
  m.used[out] = 2;
  const R = m.rules, A = m.attack;
  R.yellow[j] = 0; R.hurt[j] = 0; R.offFlag[j] = 0;
  A.boxSlot[j] = -1; A.runUntil[j] = 0; A.runNext[j] = 0;
  m.dist[j] = 0; m.sprint[j] = 0; m.distMark[j] = 0; m.sprintMark[j] = 0;
  loadPerson(m, j, inn);
  initPlayerOnBall(m, j);
  // On from the touchline by halfway.
  m.px[j] = T.pitch.halfway + (side === 0 ? -SB.alongM : SB.alongM);
  m.py[j] = SB.across;
  m.vx[j] = 0; m.vy[j] = 0;
  m.tx[j] = m.px[j]; m.ty[j] = m.py[j];
  m.role[j] = 0;
  m.nextThink[j] = m.clockMs;
  if (m.ball.owner === j) m.ball.owner = -1;
  if (m.restartTaker === j && m.ball.state === BALL_DEAD) m.restartTaker = pickTaker(m, m.restartKind, m.restartSide, m.restartX, m.restartY);
  const team = m.teams[side];
  applyTeamTactics(m, team, team.tactics);
  resolveMarker(m, m.teams[1 - side]);
}

// ---------------------------------------------------------------------------
// Short-handed shapes
// ---------------------------------------------------------------------------

const KEEP = 0.01;

/**
 * Give each outfielder of `team` a formation slot: the slots the formation keeps for the
 * number left (formations.json "short"), filled greedily by position fit, a player keeping
 * his slot on a tie. A player carrying a knock with no substitutions left goes up front.
 */
export function assignSpots(m: SpatialMatch, team: TeamState): void {
  const side = team.side;
  const base = side * 11;
  const players: number[] = [];
  for (let s = 1; s < 11; s++) if (m.on[base + s]) players.push(s);
  const f = team.formation;
  const sh = f.short?.[String(players.length + 1)];
  let slots: number[] = [];
  for (let k = 1; k < 11; k++) if (!sh || !sh.drop.includes(k)) slots.push(k);
  // Fewer still: lose the most advanced slots.
  if (slots.length > players.length) {
    const u = (k: number) => {
      const o = sh?.set?.[String(k)];
      return o ? o.att[0] : (f.slots[k].att ?? f.slots[k].def ?? [0, 0])[0];
    };
    slots = slots.sort((a, b) => u(a) - u(b) || a - b).slice(0, players.length).sort((a, b) => a - b);
  }
  const pairs: { s: number; k: number; v: number }[] = [];
  for (const s of players) {
    const p = personOf(m.setup, m.who[base + s]) as SpatialPlayer;
    const fit = { position: p.position, secondaryPositions: p.secondary ?? [] };
    for (const k of slots) pairs.push({ s, k, v: positionFit(fit, f.slots[k].position as Position) + (team.spot[s] === k ? KEEP : 0) });
  }
  pairs.sort((a, b) => b.v - a.v || a.k - b.k || a.s - b.s);
  const doneS = new Set<number>(), doneK = new Set<number>();
  for (const pr of pairs) {
    if (doneS.has(pr.s) || doneK.has(pr.k)) continue;
    team.spot[pr.s] = pr.k;
    doneS.add(pr.s);
    doneK.add(pr.k);
  }
  // The spots of players off the pitch: whatever is left, so every index has one.
  const free: number[] = [];
  for (let k = 1; k < 11; k++) if (!doneK.has(k)) free.push(k);
  for (let s = 1; s < 11; s++) if (!doneS.has(s)) team.spot[s] = free.shift() ?? s;
  team.spot[0] = 0;
  if (m.subsUsed[side] >= MAX_SUBS) {
    for (const s of players) {
      if (!m.rules.hurt[base + s]) continue;
      let top = -1, tu = -Infinity;
      for (const t of players) {
        const k = team.spot[t];
        const o = sh?.set?.[String(k)];
        const u = o ? o.att[0] : (f.slots[k].att ?? f.slots[k].def ?? [0, 0])[0];
        if (!m.rules.hurt[base + t] && u > tu) { tu = u; top = t; }
      }
      if (top >= 0) {
        const k = team.spot[top];
        team.spot[top] = team.spot[s];
        team.spot[s] = k;
      }
    }
  }
  applyTeamTactics(m, team, team.tactics);
}

// ---------------------------------------------------------------------------
// The shootout
// ---------------------------------------------------------------------------

/** Kick order: the named penalty taker, then outfielders by set pieces plus composure, keepers last. */
function kickOrder(m: SpatialMatch, side: Side): number[] {
  const at = m.onball.attr;
  const out: number[] = [], keepers: number[] = [];
  for (let s = 0; s < 11; s++) {
    const i = side * 11 + s;
    if (!m.on[i]) continue;
    ((personOf(m.setup, m.who[i]) as SpatialPlayer).position === 'GK' ? keepers : out).push(i);
  }
  const q = (i: number) => at[i * ATTRS + A_SPK] + at[i * ATTRS + A_CMP];
  out.sort((a, b) => q(b) - q(a) || m.who[a] - m.who[b]);
  const order = [...out, ...keepers].map((i) => m.who[i]);
  const named = m.teams[side].tactics.setPieceTakers.penalties;
  const nw = named ? whoOf(m.setup, side, named) : -1;
  const k = order.indexOf(nw);
  if (k > 0) { order.splice(k, 1); order.unshift(nw); }
  return order;
}

export function startShootout(m: SpatialMatch): void {
  const first: Side = m.rng.chance(SHOOT.firstKickHomeChance) ? 0 : 1;
  const so: ShootoutState = { score: [0, 0], kicks: [], order: [kickOrder(m, 0), kickOrder(m, 1)], taken: [0, 0], first, phase: 0, winner: -1 };
  m.shootout = so;
  m.subQ.length = 0;
  m.ball.state = BALL_DEAD;
  m.ball.owner = -1;
  m.ball.x = 52.5;
  m.ball.y = 34;
}

/** The side that can no longer be caught, or -1 while the shootout is alive. */
function decided(so: ShootoutState): Side | -1 {
  const K = SHOOT.kicksEach;
  const [h, a] = so.score;
  const [th, ta] = so.taken;
  if (th <= K && ta <= K) {
    if (h > a + (K - ta)) return 0;
    if (a > h + (K - th)) return 1;
    return -1;
  }
  if (th !== ta) return -1;
  return h > a ? 0 : a > h ? 1 : -1;
}

/** A shootout kick has just been struck by the player at index i (the outcome is settled at the strike). */
export function shootoutKick(m: SpatialMatch, i: number, side: Side, scored: boolean, saved: boolean): void {
  const so = m.shootout;
  if (!so) return;
  so.kicks.push({ side, player: m.who[i], keeper: m.who[(1 - side) * 11], outcome: scored ? 'scored' : saved ? 'saved' : 'missed' });
  if (scored) so.score[side]++;
  so.taken[side]++;
  so.phase = 2;
}

/** Run the shootout between kicks: wait for the kick, then set up the next one or finish. */
export function shootoutStep(m: SpatialMatch): void {
  const so = m.shootout;
  if (!so || m.period !== PERIOD.SHOOTOUT) return;
  if (so.phase === 1) return;
  if (so.phase === 2) {
    if (m.onball.passKind === KICK_SHOT) return;
    so.phase = 0;
  }
  let w = decided(so);
  if (w < 0 && so.taken[0] >= SHOOT.maxRounds && so.taken[1] >= SHOOT.maxRounds) w = m.rng.chance(SHOOT.firstKickHomeChance) ? 0 : 1;
  if (w >= 0) {
    so.winner = w;
    m.periodLog.push({ period: PERIOD.SHOOTOUT, startMs: m.periodStart, endMs: m.clockMs, added: 0 });
    whistle(m, w as Side, 'shootout');
    m.period = PERIOD.DONE;
    m.ball.state = BALL_DEAD;
    m.ball.owner = -1;
    return;
  }
  const side = ((so.taken[0] + so.taken[1]) % 2 === 0 ? so.first : 1 - so.first) as Side;
  const order = so.order[side];
  const taker = order[so.taken[side] % order.length];
  goDead(m, RESTART_PENALTY, side, PD.gapMs, depthOf(side, LENGTH - T.penalty.spot), GC);
  m.rules.indirect = false;
  m.restartTaker = m.at[taker];
  so.phase = 1;
}
