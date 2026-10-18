/**
 * The engine's last second or so, kept for the 3D match (Stage 5.2). Strikes in the engine
 * are instant: one step the ball is at the player's feet, the next it is gone. To show a
 * leg swing back before that, the 3D view runs `lagMs` behind the engine and this tape
 * hands it each step's positions plus action cues: who kicks, heads, tackles, dives or
 * throws, and when the contact is. Cues are found by comparing the engine's state from one
 * step to the next, so the sim needs no hooks for them.
 */
import { ACT, CHANCE_GREAT, CHANCE_POST, CHANCE_SAVED, type ActionCue, type MatchFrame3D } from '../../render/match/types';
import {
  BALL_DEAD, BALL_HELD, KICK_SHOT, LENGTH, PSTATS, PS_TACKLES, SHOT_VALUES, SP_THROW, type SpatialMatch,
} from '../../sim/spatial/state';
import { PERSONS } from '../../sim/spatial/types';
import tuning from '../../data/tuning/match3d.json';

const A = tuning.actions;
/** Match time kept: the lag, and the run-up to a goal for its replay (Stage 5.3). */
const KEEP_MS = tuning.replays.keepS * 1000;
/** Steps kept: enough to cover KEEP_MS at the finest step (100 ms), with room to spare. */
const RING = Math.ceil(KEEP_MS / 100) + 16;
/** A gap bigger than this between two steps (a seek) starts the tape again. */
const JUMP_MS = 3000;
/** Goal mouth half-width plus a little: a shot inside this makes the keeper go for it. */
const MOUTH = 3.66 + 1.6;
const GC = 34;

export class MatchTape {
  private readonly t = new Float64Array(RING);
  private readonly px = new Float32Array(RING * 22);
  private readonly py = new Float32Array(RING * 22);
  private readonly vx = new Float32Array(RING * 22);
  private readonly vy = new Float32Array(RING * 22);
  private readonly on = new Uint8Array(RING * 22);
  private readonly who = new Int16Array(RING * 22);
  /** Per step: ball x, y, z, state, owner, in hands, overhead. */
  private readonly ball = new Float64Array(RING * 7);
  private newest = -1;
  private count = 0;
  private nextId = 1;
  readonly cues: ActionCue[] = [];
  // The engine as it stood at the last step seen.
  private strikeMs = 0;
  private lastKick = -1;
  private touchAt = 0;
  private owner = -1;
  private inHands = false;
  private setPiece = 0;
  private ballState = 0;
  private ballZ = 0;
  private goals = 0;
  private events = 0;
  private shots = 0;
  /** Rises by one each time the tape starts again (a new match or a seek). */
  epoch = 0;
  private readonly tackles = new Float64Array(PERSONS);

  /** The 3D view's time for engine time `ms`. */
  static shown(ms: number): number {
    return ms - A.lagMs;
  }

  /** Drop everything (a new match or a seek) and start from `m`. */
  reset(m: SpatialMatch): void {
    this.epoch += 1;
    this.count = 0;
    this.newest = -1;
    this.cues.length = 0;
    this.remember(m);
    this.push(m);
  }

  /** Keep the engine's state at its clock, finding any actions since the last step. */
  capture(m: SpatialMatch): void {
    if (this.count === 0) return this.reset(m);
    const last = this.t[this.newest];
    if (m.clockMs === last) return;
    if (m.clockMs < last || m.clockMs - last > JUMP_MS) return this.reset(m);
    this.detect(m);
    this.remember(m);
    this.push(m);
    const old = m.clockMs - KEEP_MS;
    let drop = 0;
    while (drop < this.cues.length && this.cues[drop].atMs < old) drop++;
    if (drop) this.cues.splice(0, drop);
  }

  /** The earliest and latest match times on the tape. */
  get oldest(): number {
    return this.count ? this.t[(this.newest - this.count + 1 + RING) % RING] : 0;
  }

  get latest(): number {
    return this.count ? this.t[this.newest] : 0;
  }

  /** Fill `f` with the match at `ms`, blended between the two steps either side. */
  frameAt(ms: number, f: MatchFrame3D): void {
    if (this.count === 0) return;
    let b = this.newest;
    let a = b;
    // Walk back to the step at or before ms.
    for (let n = 1; n < this.count && this.t[a] > ms; n++) {
      b = a;
      a = (a - 1 + RING) % RING;
    }
    const ta = this.t[a];
    const tb = this.t[b];
    const u = tb > ta ? Math.min(1, Math.max(0, (ms - ta) / (tb - ta))) : 1;
    const oa = a * 22;
    const ob = b * 22;
    for (let i = 0; i < 22; i++) {
      f.px[i] = this.px[oa + i] + (this.px[ob + i] - this.px[oa + i]) * u;
      f.py[i] = this.py[oa + i] + (this.py[ob + i] - this.py[oa + i]) * u;
      f.vx[i] = this.vx[ob + i];
      f.vy[i] = this.vy[ob + i];
      f.on[i] = this.on[ob + i];
      f.who[i] = this.who[ob + i];
    }
    const ba = a * 7;
    const bb = b * 7;
    const B = this.ball;
    f.ballX = B[ba] + (B[bb] - B[ba]) * u;
    f.ballY = B[ba + 1] + (B[bb + 1] - B[ba + 1]) * u;
    f.ballZ = B[ba + 2] + (B[bb + 2] - B[ba + 2]) * u;
    // Held, out of play and the like change at the step the engine changed them.
    const s = u >= 1 ? bb : ba;
    f.ballState = B[s + 3];
    f.owner = B[s + 4];
    f.inHands = B[s + 5] === 1;
    f.overhead = B[s + 6] === 1;
    f.matchMs = Math.max(ta, Math.min(ms, tb));
    f.cues = this.cues;
    // The engine throws from the ground; the 3D ball leaves from the thrower's hands.
    for (let i = this.cues.length - 1; i >= 0; i--) {
      const c = this.cues[i];
      if (c.atMs > ms) continue;
      if (ms - c.atMs > A.throwLiftMs) break;
      if (c.kind === ACT.THROW) {
        f.ballZ += A.throwLift * (c.flag === 1 ? 0.8 : 1) * (1 - (ms - c.atMs) / A.throwLiftMs);
        break;
      }
    }
  }

  private push(m: SpatialMatch): void {
    const k = (this.newest + 1) % RING;
    this.newest = k;
    this.count = Math.min(RING, this.count + 1);
    this.t[k] = m.clockMs;
    const o = k * 22;
    for (let i = 0; i < 22; i++) {
      this.px[o + i] = m.px[i];
      this.py[o + i] = m.py[i];
      this.vx[o + i] = m.vx[i];
      this.vy[o + i] = m.vy[i];
      this.on[o + i] = m.on[i];
      this.who[o + i] = m.who[i];
    }
    const b = m.ball;
    const B = this.ball;
    const q = k * 7;
    B[q] = b.x;
    B[q + 1] = b.y;
    B[q + 2] = b.z;
    B[q + 3] = b.state;
    B[q + 4] = b.owner;
    B[q + 5] = m.onball.inHands ? 1 : 0;
    B[q + 6] = m.onball.setPiece === SP_THROW && b.owner >= 0 && b.state === BALL_HELD ? 1 : 0;
  }

  private remember(m: SpatialMatch): void {
    const b = m.ball;
    const ob = m.onball;
    this.strikeMs = b.strikeMs;
    this.lastKick = ob.lastKick;
    this.touchAt = ob.touchAt;
    this.owner = b.owner;
    this.inHands = ob.inHands;
    this.setPiece = ob.setPiece;
    this.ballState = b.state;
    this.ballZ = b.z;
    this.goals = m.goalLog.length;
    this.events = m.events.length;
    this.shots = m.shotLog.length;
    for (let c = 0; c < PERSONS; c++) this.tackles[c] = m.pstat[c * PSTATS + PS_TACKLES];
  }

  private cue(kind: number, player: number, atMs: number, x: number, y: number, z: number, power: number, flag = 0, fromMs = -Infinity): ActionCue {
    const c: ActionCue = { id: this.nextId++, kind, player, atMs, fromMs, x, y, z, power, flag };
    this.cues.push(c);
    return c;
  }

  /** A touch by player p, by how high the ball was. */
  private touch(p: number, t: number, x: number, y: number, z: number): void {
    const kind = z >= A.headerFrom ? ACT.HEADER : z >= A.chestFrom ? ACT.CHEST : ACT.TOUCH;
    this.cue(kind, p, t, x, y, z, 0.5);
  }

  /** What happened in the step that brought the engine to its clock. */
  private detect(m: SpatialMatch): void {
    const b = m.ball;
    const ob = m.onball;
    const t = m.clockMs;
    let done = -1;

    // Tackles: whoever's count went up. A long reach means he went to ground.
    for (let i = 0; i < 22; i++) {
      const code = m.who[i];
      if (code < 0 || m.pstat[code * PSTATS + PS_TACKLES] <= this.tackles[code]) continue;
      const d = Math.hypot(b.x - m.px[i], b.y - m.py[i]);
      this.cue(d >= A.slideFrom ? ACT.SLIDE : ACT.TACKLE, i, t, b.x, b.y, 0, 1);
      done = i;
    }
    // Fouls bring the man fouled down.
    for (let e = this.events; e < m.events.length; e++) {
      const ev = m.events[e];
      if (ev.kind !== 'foul' || ev.other === undefined) continue;
      const v = m.at[ev.other];
      if (v >= 0) this.cue(ACT.FALL, v, t, ev.x, ev.y, 0, 1);
    }

    const struck = b.strikeMs !== this.strikeMs && b.owner < 0;
    if (struck) {
      const k = ob.lastKick;
      const passer = ob.lastPasser;
      const sp = Math.hypot(b.vx, b.vy);
      const ux = sp > 1e-6 ? b.vx / sp : 1;
      const uy = sp > 1e-6 ? b.vy / sp : 0;
      const tx = b.x + ux * 10;
      const ty = b.y + uy * 10;
      const power = Math.min(1, sp / A.fullPower);
      if (ob.passKind === KICK_SHOT && ob.shooter < 0) {
        // A defender turning the other side's ball goalwards.
        if (k >= 0) this.touch(k, t, b.x, b.y, b.z);
        done = k;
      } else if (passer >= 0 && passer !== k) {
        // A cross blocked as it was hit.
        this.cue(ACT.KICK, passer, t, tx, ty, 0, power);
        if (k >= 0) this.cue(ACT.BLOCK, k, t, b.x, b.y, 0.3, 1);
        done = k;
      } else if (k >= 0) {
        done = k;
        if (ob.passKind === KICK_SHOT && ob.shotHeader) this.cue(ACT.HEADER, k, t, tx, ty, b.z, power);
        else if (this.setPiece === SP_THROW && this.owner === k) this.cue(ACT.THROW, k, t, tx, ty, 2, power);
        else if (this.inHands && this.owner === k) {
          if (sp < A.keeperThrowBelow && b.vz < A.loftedVz) this.cue(ACT.THROW, k, t, tx, ty, 1.6, power, 1);
          else this.cue(ACT.KICK, k, t, tx, ty, 0, 1, 2);
        } else this.cue(ACT.KICK, k, t, tx, ty, 0, power, b.vz > A.loftedVz ? 1 : 0);
        if (ob.passKind === KICK_SHOT) this.keeperFor(m, t);
      }
    }

    // A touch: a new man on the ball, or a loose ball touched.
    if (this.ballState !== BALL_DEAD) {
      const newOwner = b.owner >= 0 && b.owner !== this.owner;
      const touched = ob.touchAt !== this.touchAt || ob.lastKick !== this.lastKick;
      const p = newOwner ? b.owner : touched && b.owner < 0 ? ob.lastKick : -1;
      if (p >= 0 && p !== done && !struck) {
        if (ob.inHands && !this.inHands && p % 11 === 0) {
          const dive = this.diveFor(p, t);
          if (dive) dive.flag = 1;
          else this.cue(ACT.CATCH, p, t, b.x, b.y, this.ballZ, 0.5);
        } else if (!this.diveFor(p, t)) this.touch(p, t, b.x, b.y, newOwner ? this.ballZ : b.z);
      }
    }

    // Big chances missed, for a replay: the shot's outcome is settled when it is hit.
    for (let s = this.shots; s < m.shotLog.length; s++) {
      const rec = m.shotLog[s];
      if (rec.outcome === 'goal') continue;
      let how = rec.outcome === 'post' ? CHANCE_POST : rec.outcome === 'saved' ? CHANCE_SAVED : 0;
      if (how === CHANCE_SAVED && this.greatSave(m, rec.side, rec.ms, rec.xg)) how += CHANCE_GREAT;
      this.cue(ACT.CHANCE, -1, t, rec.x, rec.y, 0, Math.min(1, rec.xg), rec.side + how);
    }

    // Goals: the scorer's side celebrates.
    for (let g = this.goals; g < m.goalLog.length; g++) {
      const rec = m.goalLog[g];
      const at = rec.scorer >= 0 ? m.at[rec.scorer] : -1;
      this.cue(ACT.GOAL, at, t, b.x, b.y, 0, 1, rec.side + (rec.ownGoal ? 2 : 0));
    }
  }

  /**
   * Whether a save of a shot hit at `ms` is a great one: a real chance that the keeper only
   * reached by going a long way, or quickly, from where he stood as it was hit.
   */
  private greatSave(m: SpatialMatch, side: number, ms: number, xg: number): boolean {
    const R = tuning.replays;
    if (xg < R.greatSaveXg) return false;
    const k = (1 - side) * 11;
    // The save's dive was planned as the shot was hit, just before this.
    let dive: ActionCue | null = null;
    for (let i = this.cues.length - 1; i >= 0 && !dive; i--) {
      const c = this.cues[i];
      if (c.kind === ACT.DIVE && c.player === k && c.atMs > ms) dive = c;
    }
    if (!dive) return false;
    const reach = Math.hypot(dive.x - m.px[k], dive.y - m.py[k]);
    return reach >= R.greatReach || reach / ((dive.atMs - ms) / 1000) >= R.greatSpeed;
  }

  /** A dive cue for keeper p close to time t, if there is one. */
  private diveFor(p: number, t: number): ActionCue | null {
    for (let i = this.cues.length - 1; i >= 0; i--) {
      const c = this.cues[i];
      if (c.kind === ACT.DIVE && c.player === p && Math.abs(c.atMs - t) <= A.diveMatchMs) return c;
    }
    return null;
  }

  /**
   * A shot was just hit. Its whole flight is already planned, so the keeper (or the man who
   * blocks it) can be sent for it now: to where it is saved, blocked, or goes past him.
   */
  private keeperFor(m: SpatialMatch, t: number): void {
    const ob = m.onball;
    const path = ob.shotPath;
    // Sample k is played in the k / subN-th step after this one.
    const when = (k: number): number => t + m.stepMs * Math.ceil(k / m.subN);
    if (ob.shotEventK > 0) {
      const k = ob.shotEventK;
      const o = (k - 1) * SHOT_VALUES;
      const p = (k - 2) * SHOT_VALUES;
      const u = ob.shotEventU;
      const x0 = k > 1 ? path[p] : m.ball.x;
      const y0 = k > 1 ? path[p + 1] : m.ball.y;
      const z0 = k > 1 ? path[p + 2] : m.ball.z;
      const x = x0 + (path[o] - x0) * u;
      const y = y0 + (path[o + 1] - y0) * u;
      const z = Math.max(0, z0 + (path[o + 2] - z0) * u);
      const j = ob.shotEventPlayer;
      if (ob.shotEventKind === 2) this.cue(ACT.DIVE, j, when(k), x, y, z, 1, 0, t + A.keeperReactMs);
      else this.cue(ACT.BLOCK, j, when(k), x, y, z, 1);
      return;
    }
    // Not saved: does it go past him, near enough for a dive?
    const keeper = (1 - ob.passSide) * 11;
    if (!m.on[keeper]) return;
    for (let k = 1; k <= ob.shotN; k++) {
      const o = (k - 1) * SHOT_VALUES;
      const x = path[o];
      if (x > 0 && x < LENGTH) continue;
      const y = path[o + 1];
      const z = path[o + 2];
      if (Math.abs(y - GC) <= MOUTH && z <= A.diveHighest) {
        this.cue(ACT.DIVE, keeper, when(k), x <= 0 ? 0 : LENGTH, y, z, 1, 2, t + A.keeperReactMs);
      }
      return;
    }
  }
}
