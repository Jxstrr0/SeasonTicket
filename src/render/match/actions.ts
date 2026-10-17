/**
 * What the 3D players do with the ball (Stage 5.2): kicks, touches, headers, tackles,
 * slides, falls, keeper dives and catches, throw-ins and goal celebrations.
 *
 * The UI hands over action cues (ActionCue) before their contact time, because the view runs
 * a little behind the engine. Each cue becomes a Move here: a short, hand-keyed pose over
 * time around that contact. A pose is a set of joint targets in the player's own frame
 * (facing +z, his left is +x, up is +y): leg swing and knee bend, arm directions, a lean of
 * the spine, and a whole-body tilt and lift for dives, slides, falls and jumps. Rig lays the
 * pose over the running animation, bone by bone, by weight; several moves can overlap and
 * the newest one wins as it fades in.
 *
 * Angles here are in degrees. Times are seconds from the contact (negative is before it).
 */
import { Euler, Quaternion, Vector3, type Bone, type Object3D } from 'three';
import tuning from '../../data/tuning/match3d.json';
import { ACT, type ActionCue } from './types';

const A = tuning.actions;
const DEG = Math.PI / 180;
const G = 9.81;
const HALF_X = 52.5;
const HALF_Z = 34;

export class LegPose {
  w = 0;
  /** Forward swing of the thigh from straight down (negative swings it back). */
  flex = 0;
  /** Out to his side. */
  abd = 0;
  /** Knee bend, the shin folding back from the thigh. */
  knee = 0;
}

export class ArmPose {
  w = 0;
  /** Upper arm: up from level (-90 hangs down), and round from out to his side (90 points ahead, negative behind). */
  up = -80;
  fwd = 0;
  /** Forearm, the same way. */
  foreUp = -80;
  foreFwd = 0;
}

export class Pose {
  /** Left, right. */
  readonly leg = [new LegPose(), new LegPose()];
  readonly arm = [new ArmPose(), new ArmPose()];
  spineW = 0;
  /** Lean forward, lean to his left, turn to his left; nod is the neck alone. */
  pitch = 0;
  roll = 0;
  yaw = 0;
  nod = 0;
  bodyW = 0;
  /** The whole body, about his feet: up, to his left, ahead, tipped forward, tipped to his left. */
  lift = 0;
  x = 0;
  z = 0;
  bodyPitch = 0;
  bodyRoll = 0;
  /** Facing (stadium yaw). lock turns him at once instead of at his usual turn rate. */
  faceW = 0;
  face = 0;
  lock = false;
  /** Weight of the crouch clip (a keeper's set position). */
  crouch = 0;

  reset(): void {
    for (const l of this.leg) {
      l.w = 0;
      l.flex = 0;
      l.abd = 0;
      l.knee = 0;
    }
    for (const a of this.arm) {
      a.w = 0;
      a.up = -80;
      a.fwd = 0;
      a.foreUp = -80;
      a.foreFwd = 0;
    }
    this.spineW = this.pitch = this.roll = this.yaw = this.nod = 0;
    this.bodyW = this.lift = this.x = this.z = this.bodyPitch = this.bodyRoll = 0;
    this.faceW = this.face = this.crouch = 0;
    this.lock = false;
  }

  /** Swap left and right (a left-footed kick, a tackle with the other leg). */
  mirror(): void {
    swapLeg(this.leg[0], this.leg[1]);
    swapArm(this.arm[0], this.arm[1]);
    this.roll = -this.roll;
    this.yaw = -this.yaw;
    this.bodyRoll = -this.bodyRoll;
    this.x = -this.x;
  }
}

function swapLeg(a: LegPose, b: LegPose): void {
  [a.w, b.w] = [b.w, a.w];
  [a.flex, b.flex] = [b.flex, a.flex];
  [a.abd, b.abd] = [b.abd, a.abd];
  [a.knee, b.knee] = [b.knee, a.knee];
}

function swapArm(a: ArmPose, b: ArmPose): void {
  [a.w, b.w] = [b.w, a.w];
  [a.up, b.up] = [b.up, a.up];
  [a.fwd, b.fwd] = [b.fwd, a.fwd];
  [a.foreUp, b.foreUp] = [b.foreUp, a.foreUp];
  [a.foreFwd, b.foreFwd] = [b.foreFwd, a.foreFwd];
}

const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Value at t on keys [t0, v0, t1, v1, ...], eased between keys and held past the ends. */
export function keys(t: number, k: readonly number[]): number {
  if (t <= k[0]) return k[1];
  for (let i = 2; i < k.length; i += 2) {
    if (t <= k[i]) return k[i - 1] + (k[i + 1] - k[i - 1]) * smooth((t - k[i - 2]) / (k[i] - k[i - 2]));
  }
  return k[k.length - 1];
}

/** 0 before a, up to 1 by b, 1 until c, back to 0 by d. */
export function env(t: number, a: number, b: number, c: number, d: number): number {
  if (t <= a || t >= d) return 0;
  if (t < b) return smooth((t - a) / (b - a));
  if (t > c) return 1 - smooth((t - c) / (d - c));
  return 1;
}

function arm(a: ArmPose, w: number, up: number, fwd: number, foreUp: number, foreFwd: number): void {
  a.w = w;
  a.up = up;
  a.fwd = fwd;
  a.foreUp = foreUp;
  a.foreFwd = foreFwd;
}

function leg(l: LegPose, w: number, flex: number, knee: number, abd = 0): void {
  l.w = w;
  l.flex = flex;
  l.knee = knee;
  l.abd = abd;
}

/** How far the hips drop when both legs bend with the feet kept down. */
function drop(flex: number, knee: number): number {
  const L = 0.45;
  return L * (1 - Math.cos(flex * DEG)) + L * (1 - Math.cos((flex - knee) * DEG));
}

/** Where the player is and faces, for moves that aim at something. */
export interface MoveContext {
  /** Stadium x, z and yaw. */
  x: number;
  z: number;
  heading: number;
  /** Kicks with his left. */
  left: boolean;
}

const GOAL_SCORER = 1;
const GOAL_MATE = 2;
const GOAL_KEEPER = 3;
const GOAL_BEATEN = 4;
const GOAL_BEATEN_KEEPER = 5;

const NEAR_CHEST = 1;
const NEAR_JUMP = 2;
const NEAR_SCOOP = 3;
const DIVE = 4;

/** Holding the ball in his hands, arms forward and bent. */
const HOLD = { up: -35, fwd: 75, foreUp: 5, foreFwd: 88 };
/** A throw-in taker with the ball over and just behind his head. */
const OVERHEAD = { up: 60, fwd: 70, foreUp: 80, foreFwd: -100 };

/**
 * One cue as it plays on one player. Times are kept in match ms; `start` and `end` bound when
 * it shows. Some moves settle details the first time they play (where a keeper dives to).
 */
export class Move {
  start: number;
  end: number;
  readonly pose = new Pose();
  private ready = false;
  private variant = 0;
  private side = 1;
  private h0 = 0;
  private x0 = 0;
  private z0 = 0;
  private theta = 0;
  private shift = 0;
  private reach = 0;
  private height = 0;
  private air = 0;
  private delay = 0;
  private mirrored = false;

  constructor(
    readonly cue: ActionCue,
    /** For a GOAL cue: what this player does (GOAL_SCORER and so on), from goalRole. */
    private readonly role = 0,
    /** A number from 0 to 1, different for each player, to stagger celebrations. */
    seed = 0,
  ) {
    const span = this.span(seed);
    this.start = cue.atMs + span[0] * 1000;
    this.end = cue.atMs + span[1] * 1000;
  }

  /** Seconds from the contact that the move starts and ends. */
  private span(seed: number): [number, number] {
    const c = this.cue;
    switch (c.kind) {
      case ACT.KICK:
        return [-this.wind() - 0.05, 0.5];
      case ACT.TOUCH:
        return [-0.2, 0.32];
      case ACT.CHEST:
        return [-0.32, 0.5];
      case ACT.HEADER: {
        if (c.z < A.jumpFrom) return [-0.3, 0.35];
        this.air = airTime(Math.min(0.6, Math.max(0.12, c.z - 1.75)));
        return [-this.air / 2 - 0.18, this.air / 2 + 0.25];
      }
      case ACT.TACKLE:
        return [-0.25, 0.45];
      case ACT.SLIDE:
        return [-0.35, 1.55];
      case ACT.FALL:
        return [0, 2.3];
      case ACT.BLOCK:
        return [-0.25, 0.45];
      case ACT.THROW:
        return c.flag === 1 ? [-0.45, 0.45] : [-0.5, 0.55];
      case ACT.DIVE:
      case ACT.CATCH: {
        // The dive's own length is settled when it starts; this is the longest it can be.
        const from = Math.max((c.fromMs - c.atMs) / 1000, -A.diveLead);
        return [Math.min(from, -0.15), c.kind === ACT.DIVE ? 3.4 : 1.2];
      }
      case ACT.GOAL: {
        this.delay = this.role === GOAL_SCORER ? 0 : 0.25 + 0.9 * seed;
        const long = this.role === GOAL_SCORER ? 6.5 : this.role === GOAL_BEATEN ? 3.4 : 2.9;
        return this.role ? [this.delay, this.delay + long] : [0, 0];
      }
    }
    return [0, 0];
  }

  private wind(): number {
    return A.kickWind + A.kickWindPower * (this.cue.flag === 2 ? 1 : this.cue.power);
  }

  /** The pose at match time `ms`. */
  at(ms: number, ctx: MoveContext): Pose {
    const p = this.pose;
    p.reset();
    if (!this.ready) this.settle(ctx);
    const t = (ms - this.cue.atMs) / 1000;
    const c = this.cue;
    switch (c.kind) {
      case ACT.KICK:
        this.kick(t, ctx);
        break;
      case ACT.TOUCH:
        this.touch(t);
        break;
      case ACT.CHEST:
        this.chest(t);
        break;
      case ACT.HEADER:
        this.header(t, ctx);
        break;
      case ACT.TACKLE:
        this.tackle(t, ctx);
        break;
      case ACT.SLIDE:
        this.slide(t);
        break;
      case ACT.FALL:
        this.fall(t);
        break;
      case ACT.BLOCK:
        this.block(t);
        break;
      case ACT.THROW:
        this.throwIn(t, ctx);
        break;
      case ACT.DIVE:
      case ACT.CATCH:
        if (this.variant === DIVE) this.dive(t, ctx);
        else this.near(t);
        break;
      case ACT.GOAL:
        this.goal(t);
        break;
    }
    if (this.mirrored) p.mirror();
    return p;
  }

  /** Details that depend on where he is when the move begins. */
  private settle(ctx: MoveContext): void {
    this.ready = true;
    const c = this.cue;
    const tx = c.x - HALF_X;
    const tz = c.y - HALF_Z;
    const dx = tx - ctx.x;
    const dz = tz - ctx.z;
    // His left (+x of his frame) is (cos h, -sin h) on the pitch.
    const cos = Math.cos(ctx.heading);
    const sin = Math.sin(ctx.heading);
    const lateral = dx * cos - dz * sin;
    this.h0 = ctx.heading;
    this.x0 = ctx.x;
    this.z0 = ctx.z;
    // The leg nearer the ball does the work; kicks use his stronger foot.
    if (c.kind === ACT.KICK) this.mirrored = ctx.left;
    else if (c.kind === ACT.TOUCH || c.kind === ACT.TACKLE || c.kind === ACT.SLIDE || c.kind === ACT.BLOCK) this.mirrored = lateral > 0.05;
    if (c.kind === ACT.SLIDE && Math.hypot(dx, dz) > 0.3) this.h0 = Math.atan2(dx, dz);
    if (c.kind === ACT.DIVE || c.kind === ACT.CATCH) this.settleKeeper(lateral, dx * sin + dz * cos);
  }

  private settleKeeper(lateral: number, ahead: number): void {
    const c = this.cue;
    const z = Math.max(0, c.z);
    if (c.kind === ACT.CATCH || Math.abs(lateral) < A.diveFrom) {
      this.variant = z >= A.jumpFrom ? NEAR_JUMP : z < 0.55 ? NEAR_SCOOP : NEAR_CHEST;
      this.height = z;
      if (this.variant === NEAR_JUMP) {
        this.air = airTime(Math.min(0.55, Math.max(0.15, z - 2.25)));
        this.start = c.atMs - (this.air / 2 + 0.15) * 1000;
        this.end = c.atMs + (this.air / 2 + 0.45) * 1000;
      } else {
        this.start = Math.max(this.start, c.atMs - 350);
        this.end = c.atMs + (this.variant === NEAR_SCOOP ? 900 : 650);
      }
      return;
    }
    this.variant = DIVE;
    this.side = lateral > 0 ? 1 : -1;
    const d = Math.abs(lateral);
    const L = A.diveReach;
    this.theta = Math.min(95, Math.max(35, 90 - 0.8 * Math.atan2(z - 0.3, d) / DEG));
    this.shift = Math.max(0, d - L * Math.sin(this.theta * DEG));
    this.height = Math.min(0.8, Math.max(0, z - L * Math.cos(this.theta * DEG)));
    this.reach = Math.min(1, Math.max(-0.4, ahead - 0.3));
    const lie = c.flag === 2 ? 1.3 : 0.65;
    this.end = c.atMs + (0.4 + lie + 0.9) * 1000;
  }

  private kick(t: number, ctx: MoveContext): void {
    const p = this.pose;
    const c = this.cue;
    const punt = c.flag === 2;
    const pw = punt ? 1 : c.power;
    const lofted = c.flag >= 1;
    const w0 = -this.wind();
    const e = env(t, w0 - 0.05, w0 + 0.05, 0.25, 0.5);
    leg(p.leg[1], e,
      keys(t, [w0, 0, -0.08, -(25 + 15 * pw), 0, 10, 0.16, 30 + 45 * pw + (lofted ? 15 : 0), 0.45, 0]),
      keys(t, [w0, 5, -0.08, 75 + 15 * pw, 0, 20, 0.16, 10, 0.45, 5]), 4);
    leg(p.leg[0], 0.7 * e, keys(t, [w0, 0, 0, 12, 0.3, 0]), keys(t, [w0, 0, 0, 28, 0.35, 0]));
    p.bodyW = e;
    p.lift = keys(t, [w0, 0, 0, -0.04, 0.3, 0]);
    if (punt && t < -0.1) {
      // Ball in both hands until he drops it onto his foot.
      arm(p.arm[0], e, HOLD.up, HOLD.fwd, HOLD.foreUp, HOLD.foreFwd);
      arm(p.arm[1], e, HOLD.up, HOLD.fwd, HOLD.foreUp, HOLD.foreFwd);
    } else {
      const up = keys(t, [w0, -70, -0.05, -10, 0.25, -30, 0.5, -70]);
      arm(p.arm[0], 0.9 * e, up, 35, up + 10, 50);
      arm(p.arm[1], 0.8 * e, -45, -35, -40, -20);
    }
    p.spineW = e;
    p.pitch = lofted ? keys(t, [w0, 0, -0.05, -10, 0.15, -14, 0.45, 0]) : keys(t, [w0, 0, -0.05, 4, 0.15, 14, 0.45, 0]);
    p.yaw = keys(t, [w0, 0, -0.08, -12, 0.12, 14, 0.45, 0]);
    p.roll = 8;
    this.faceTo(ctx, env(t, w0 - 0.05, w0 + 0.1, 0.05, 0.3));
  }

  private touch(t: number): void {
    const p = this.pose;
    const e = env(t, -0.2, -0.1, 0.08, 0.32);
    leg(p.leg[1], e, keys(t, [-0.2, 0, -0.03, 26, 0.12, 14, 0.32, 0]), keys(t, [-0.2, 0, -0.03, 40, 0.32, 0]));
    arm(p.arm[0], 0.5 * e, -60, 15, -55, 25);
    arm(p.arm[1], 0.5 * e, -60, 15, -55, 25);
  }

  private chest(t: number): void {
    const p = this.pose;
    const e = env(t, -0.32, -0.15, 0.2, 0.5);
    p.spineW = e;
    p.pitch = keys(t, [-0.32, 0, -0.05, -24, 0.2, -16, 0.5, 0]);
    arm(p.arm[0], 0.9 * e, -35, -20, -30, -5);
    arm(p.arm[1], 0.9 * e, -35, -20, -30, -5);
    leg(p.leg[0], e, 8, 20);
    leg(p.leg[1], e, 8, 20);
    p.bodyW = e;
    p.lift = -0.03;
  }

  private header(t: number, ctx: MoveContext): void {
    const p = this.pose;
    const jump = this.air > 0;
    const half = this.air / 2;
    const a = jump ? -half - 0.18 : -0.3;
    const d = jump ? half + 0.25 : 0.35;
    const e = env(t, a, a + 0.1, d - 0.12, d);
    p.spineW = e;
    p.pitch = keys(t, [a, 0, -0.1, -16, 0.04, 20, 0.22, 4, d, 0]);
    p.nod = 0.8 * p.pitch;
    arm(p.arm[0], 0.85 * e, -5, 40, 5, 75);
    arm(p.arm[1], 0.85 * e, -5, 40, 5, 75);
    if (jump) {
      const h = Math.min(0.6, Math.max(0.12, this.cue.z - 1.75));
      p.bodyW = 1;
      if (t < -half) {
        p.lift = keys(t, [a, 0, -half, -0.12]);
        leg(p.leg[0], e, 30, 60);
        leg(p.leg[1], e, 30, 60);
      } else if (t <= half) {
        const u = t / half;
        p.lift = h * (1 - u * u);
        leg(p.leg[0], e, 20, 45);
        leg(p.leg[1], e, 8, 28);
      } else {
        p.lift = keys(t, [half, 0, half + 0.08, -0.1, d, 0]);
        leg(p.leg[0], e, keys(t, [half, 20, d, 0]), keys(t, [half, 40, d, 0]));
        leg(p.leg[1], e, keys(t, [half, 20, d, 0]), keys(t, [half, 40, d, 0]));
      }
    }
    this.faceTo(ctx, env(t, a, a + 0.12, 0.05, d));
  }

  private tackle(t: number, ctx: MoveContext): void {
    const p = this.pose;
    const e = env(t, -0.25, -0.12, 0.2, 0.45);
    leg(p.leg[1], e, keys(t, [-0.25, 0, -0.04, 48, 0.2, 42, 0.45, 0]), keys(t, [-0.25, 0, -0.12, 30, 0, 8, 0.45, 0]), 22);
    leg(p.leg[0], 0.8 * e, 15, 35);
    p.bodyW = e;
    p.lift = -0.07;
    p.spineW = e;
    p.pitch = 14;
    arm(p.arm[0], e, -25, 20, -20, 40);
    arm(p.arm[1], e, -25, 20, -20, 40);
    this.faceTo(ctx, e, 0.4);
  }

  private slide(t: number): void {
    const p = this.pose;
    const e = env(t, -0.35, -0.2, 1.0, 1.4);
    p.bodyW = 1;
    p.bodyPitch = keys(t, [-0.35, 0, -0.05, -68, 0.8, -72, 1.1, -35, 1.55, 0]);
    p.z = keys(t, [-0.35, 0, 0, 0.5, 0.45, 0.9, 1.1, 0.9, 1.55, 0]);
    p.lift = 0.04 * e;
    leg(p.leg[1], e, keys(t, [-0.35, 0, -0.05, 18, 0.8, 15, 1.1, 0]), 0);
    leg(p.leg[0], e, 5, 85);
    arm(p.arm[0], e, -35, -40, -30, -30);
    arm(p.arm[1], e, 25, 35, 30, 45);
    p.spineW = e;
    p.pitch = 25;
    this.lockTo(this.h0);
  }

  private fall(t: number): void {
    const p = this.pose;
    const e = env(t, 0, 0.2, 1.9, 2.3);
    p.bodyW = 1;
    p.bodyPitch = keys(t, [0, 0, 0.45, 82, 1.45, 82, 1.85, 25, 2.3, 0]);
    const up = keys(t, [0, -70, 0.3, 70, 1.45, 70, 1.9, -70]);
    arm(p.arm[0], e, up, 50, up, 55);
    arm(p.arm[1], e, up, 50, up, 55);
    leg(p.leg[0], e, 0, 15);
    leg(p.leg[1], e, 0, 20);
    p.spineW = e;
    p.pitch = -12;
    this.lockTo(this.h0);
  }

  private block(t: number): void {
    const p = this.pose;
    const e = env(t, -0.25, -0.12, 0.2, 0.45);
    arm(p.arm[0], e, -75, -15, -60, 10);
    arm(p.arm[1], e, -75, -15, -60, 10);
    p.spineW = e;
    p.pitch = 12;
    p.yaw = 20;
    const z = this.cue.z;
    if (z < 0.7) leg(p.leg[1], e, 30, 10, 25);
    else if (z > 1.2) {
      p.bodyW = 1;
      p.lift = t > -0.15 && t < 0.15 ? 0.15 * (1 - (t / 0.15) ** 2) : 0;
    }
  }

  private throwIn(t: number, ctx: MoveContext): void {
    const p = this.pose;
    if (this.cue.flag === 1) {
      // A keeper bowling it out with his right arm.
      const e = env(t, -0.45, -0.3, 0.15, 0.45);
      const up = keys(t, [-0.45, -30, -0.2, 10, 0, 60, 0.4, -70]);
      const fwd = keys(t, [-0.45, 75, -0.2, -60, 0, 80, 0.4, 10]);
      arm(p.arm[1], e, up, fwd, up, fwd);
      arm(p.arm[0], e, 0, 80, 0, 85);
      p.spineW = e;
      p.pitch = keys(t, [-0.45, 0, -0.2, -8, 0.05, 15, 0.45, 0]);
    } else {
      const e = env(t, -0.5, -0.5, 0.2, 0.55);
      const up = keys(t, [-0.5, OVERHEAD.up, -0.15, 80, 0.05, 30, 0.55, -75]);
      const fwd = keys(t, [-0.5, OVERHEAD.fwd, -0.15, 20, 0.05, 85, 0.55, 10]);
      const foreUp = keys(t, [-0.5, OVERHEAD.foreUp, -0.15, 55, 0.05, 25, 0.55, -75]);
      const foreFwd = keys(t, [-0.5, OVERHEAD.foreFwd, -0.15, -110, 0.05, 85, 0.55, 10]);
      arm(p.arm[0], e, up, fwd, foreUp, foreFwd);
      arm(p.arm[1], e, up, fwd, foreUp, foreFwd);
      p.spineW = e;
      p.pitch = keys(t, [-0.5, -5, -0.15, -22, 0.05, 25, 0.55, 0]);
    }
    this.faceTo(ctx, env(t, -0.5, -0.4, 0.1, 0.4));
  }

  /** A keeper going for it without a dive: up for it, down for it, or at his chest. */
  private near(t: number): void {
    const p = this.pose;
    const held = this.cue.kind === ACT.CATCH || this.cue.flag === 1;
    const after = held && t > 0 ? smooth(t / 0.3) : 0;
    const a = (this.start - this.cue.atMs) / 1000;
    const d = (this.end - this.cue.atMs) / 1000;
    const e = env(t, a, a + 0.12, d - 0.25, d);
    if (this.variant === NEAR_JUMP) {
      const half = this.air / 2;
      const h = Math.min(0.55, Math.max(0.15, this.height - 2.25));
      p.bodyW = 1;
      if (t < -half) p.lift = keys(t, [a, 0, -half, -0.1]);
      else if (t <= half) p.lift = h * (1 - (t / half) ** 2);
      else p.lift = keys(t, [half, 0, half + 0.08, -0.08, d, 0]);
      leg(p.leg[0], e, 15, 35);
      leg(p.leg[1], e, 5, 20);
      reachArms(p, e, after, 80, 60, 85, 60);
    } else if (this.variant === NEAR_SCOOP) {
      const k = keys(t, [a, 0, -0.05, 1, 0.35, 1, d, 0]);
      leg(p.leg[0], e, 60 * k, 100 * k);
      leg(p.leg[1], e, 60 * k, 100 * k);
      p.bodyW = 1;
      p.lift = -drop(60 * k, 100 * k);
      p.spineW = e;
      p.pitch = 35 * k;
      reachArms(p, e, after, -55, 80, -35, 90);
    } else {
      const up = Math.max(-50, Math.min(60, Math.asin(Math.max(-1, Math.min(1, (this.height - 1.35) / 0.6))) / DEG));
      p.spineW = e;
      p.pitch = 10;
      reachArms(p, e, after, up, 80, up + 10, 85);
    }
  }

  private dive(t: number, ctx: MoveContext): void {
    const p = this.pose;
    const a = (this.start - this.cue.atMs) / 1000;
    const lie = this.cue.flag === 2 ? 1.3 : 0.65;
    const up = 0.4 + lie;
    const d = up + 0.9;
    let roll: number;
    let out: number;
    let lift: number;
    if (t < 0) {
      const u = (t - a) / -a;
      const s = smooth(u);
      roll = this.theta * s;
      out = s;
      lift = this.height * Math.sin((Math.max(0, u) * Math.PI) / 2);
    } else if (t < up) {
      const s = smooth(t / 0.4);
      roll = this.theta + (Math.max(this.theta, 88) - this.theta) * s;
      out = 1;
      lift = this.height * (1 - s);
    } else {
      const s = smooth((t - up) / 0.9);
      roll = Math.max(this.theta, 88) * (1 - s);
      out = 1 - s;
      lift = 0;
    }
    p.bodyW = 1;
    p.bodyRoll = this.side * roll;
    p.lift = lift;
    // His feet push off from where he stood, wherever the engine has him now.
    const cos = Math.cos(this.h0);
    const sin = Math.sin(this.h0);
    const ax = this.x0 - ctx.x;
    const az = this.z0 - ctx.z;
    p.x = (this.side * this.shift + ax * cos - az * sin) * out;
    p.z = (this.reach + ax * sin + az * cos) * out;
    const e = env(t, a, a + 0.12, d - 0.5, d);
    const held = this.cue.flag === 1 && t > 0 ? smooth(t / 0.3) : 0;
    reachArms(p, e, held, 75, 25, 80, 25);
    leg(p.leg[0], e, 15, 25);
    leg(p.leg[1], e, 5, 30);
    this.lockTo(this.h0);
  }

  private goal(t: number): void {
    const p = this.pose;
    const r = (t - this.delay) / 1;
    const a = this.delay;
    const d = this.end / 1000 - this.cue.atMs / 1000;
    const e = env(t, a, a + 0.35, d - 0.4, d);
    switch (this.role) {
      case GOAL_SCORER: {
        // Arms out like a plane, then a fist pump.
        const sway = t < 4 ? 12 * Math.sin(t * 2.2) : 0;
        arm(p.arm[0], e, keys(t, [0.3, 0, 3.9, 0, 4.3, -70]), keys(t, [0.3, -10, 3.9, -10, 4.3, 10]), keys(t, [0.3, 0, 3.9, 0, 4.3, -65]), 10);
        const pump = t > 4.3 ? 10 * Math.sin((t - 4.3) * 9) : 0;
        arm(p.arm[1], e, keys(t, [0.3, 0, 3.9, 0, 4.3, 40]), keys(t, [0.3, -10, 3.9, -10, 4.3, 60]), keys(t, [0.3, 0, 3.9, 0, 4.3, 85]) + pump, keys(t, [0.3, -10, 3.9, -10, 4.3, 60]));
        p.spineW = e;
        p.roll = sway;
        p.pitch = keys(t, [0, 0, 1, -8, 4, -8, 4.5, 5]);
        break;
      }
      case GOAL_MATE: {
        const bob = 6 * Math.sin(r * 7);
        arm(p.arm[0], e, 75 + bob, 25, 85 + bob, 25);
        arm(p.arm[1], e, 75 - bob, 25, 85 - bob, 25);
        break;
      }
      case GOAL_KEEPER:
        arm(p.arm[1], e, 70, 20, 85, 20);
        break;
      case GOAL_BEATEN:
        arm(p.arm[0], e, 45, 25, 35, 175);
        arm(p.arm[1], e, 45, 25, 35, 175);
        p.spineW = e;
        p.pitch = 10;
        break;
      case GOAL_BEATEN_KEEPER:
        p.crouch = 0.9 * e;
        p.spineW = e;
        p.pitch = 20;
        break;
    }
  }

  /** Face the cue's point, if it is far enough away to face. */
  private faceTo(ctx: MoveContext, w: number, near = 2): void {
    const dx = this.cue.x - HALF_X - ctx.x;
    const dz = this.cue.y - HALF_Z - ctx.z;
    if (w <= 0 || dx * dx + dz * dz < near * near) return;
    this.pose.faceW = w;
    this.pose.face = Math.atan2(dx, dz);
  }

  private lockTo(h: number): void {
    this.pose.faceW = 1;
    this.pose.face = h;
    this.pose.lock = true;
  }
}

/** Both arms reaching at (up, fwd), then brought in to hold the ball by `held`. */
function reachArms(p: Pose, w: number, held: number, up: number, fwd: number, foreUp: number, foreFwd: number): void {
  const m = (a: number, b: number): number => a + (b - a) * held;
  for (const a of p.arm) arm(a, w, m(up, HOLD.up), m(fwd, HOLD.fwd), m(foreUp, HOLD.foreUp), m(foreFwd, HOLD.foreFwd));
}

function airTime(h: number): number {
  return 2 * Math.sqrt((2 * h) / G);
}

/**
 * What player `i` does for a goal by side `side`: the scorer, his team-mates nearby and
 * their keeper celebrate; the other side's heads drop. 0 is nothing.
 */
export function goalRole(cue: ActionCue, i: number, distance: number): number {
  const scoring = cue.flag & 1;
  const ownGoal = cue.flag >= 2;
  const mine = (i < 11 ? 0 : 1) === scoring;
  const keeper = i % 11 === 0;
  if (!mine) return keeper ? GOAL_BEATEN_KEEPER : GOAL_BEATEN;
  if (keeper) return GOAL_KEEPER;
  if (i === cue.player && !ownGoal) return GOAL_SCORER;
  return distance <= A.celebrateWithin ? GOAL_MATE : 0;
}

/** The standing poses that are not moves: a keeper holding the ball, a throw-in taker. */
export function holdPose(p: Pose, overhead: boolean): void {
  const h = overhead ? OVERHEAD : HOLD;
  for (const a of p.arm) arm(a, 1, h.up, h.fwd, h.foreUp, h.foreFwd);
}

const LIMBS = [
  ['upperarm_l', 'lowerarm_l', 'hand_l'],
  ['upperarm_r', 'lowerarm_r', 'hand_r'],
  ['thigh_l', 'calf_l', 'foot_l'],
  ['thigh_r', 'calf_r', 'foot_r'],
] as const;
const SPINE = ['spine_01', 'spine_02', 'spine_03'] as const;

interface Joint {
  bone: Bone;
  /** Body-space rotation and the direction to the next joint, in the rest pose. */
  rest: Quaternion;
  dir: Vector3;
  /** The clips do not move it, so it is put back to rest before each pose. */
  still: boolean;
  restLocal: Quaternion;
}

const qa = new Quaternion();
const qb = new Quaternion();
const qc = new Quaternion();
const qd = new Quaternion();
const va = new Vector3();
const vb = new Vector3();
const out = new Quaternion();
const eul = new Euler();

/** Lays poses over a body's animated bones. */
export class Rig {
  /** [left arm, right arm, left leg, right leg], each [upper, lower]. */
  private readonly limbs: [Joint, Joint][] = [];
  private readonly spine: Joint[] = [];
  private readonly neck: Joint | null;

  constructor(
    private readonly body: Object3D,
    bones: Map<string, Bone>,
    animated: Set<string>,
  ) {
    body.updateMatrixWorld(true);
    const inv = body.matrixWorld.clone().invert();
    const pos = (b: Bone, out: Vector3): Vector3 => out.setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv);
    const joint = (name: string, next?: string): Joint => {
      const bone = bones.get(name);
      if (!bone) throw new Error(`the player rig is missing ${name}`);
      const dir = new Vector3(0, 1, 0);
      const to = next ? bones.get(next) : undefined;
      if (to) dir.subVectors(pos(to, vb), pos(bone, va)).normalize();
      return { bone, rest: this.bodyQuat(bone, new Quaternion()), dir, still: !animated.has(name), restLocal: bone.quaternion.clone() };
    };
    for (const [a, b, c] of LIMBS) this.limbs.push([joint(a, b), joint(b, c)]);
    for (const s of SPINE) this.spine.push(joint(s));
    this.neck = bones.has('neck_01') ? joint('neck_01') : null;
  }

  /** Lays `p` over the bones as they stand (call after the mixer). */
  apply(p: Pose): void {
    if (p.spineW > 0) {
      qd.setFromEuler(eul.set(p.pitch * DEG / 3, p.yaw * DEG / 3, -p.roll * DEG / 3));
      for (const j of this.spine) this.add(j, qd, p.spineW);
      if (this.neck && p.nod) this.add(this.neck, qd.setFromEuler(eul.set(p.nod * DEG, 0, 0)), p.spineW);
    }
    for (let s = 0; s < 2; s++) {
      const a = p.arm[s];
      if (a.w <= 0) continue;
      const side = s === 0 ? 1 : -1;
      const [upper, lower] = this.limbs[s];
      const w = this.aim(upper, armDir(va, side, a.up, a.fwd), a.w, null);
      this.aim(lower, armDir(va, side, a.foreUp, a.foreFwd), a.w, w);
    }
    for (let s = 0; s < 2; s++) {
      const l = p.leg[s];
      if (l.w <= 0) continue;
      const side = s === 0 ? 1 : -1;
      const [thigh, calf] = this.limbs[2 + s];
      const w = this.aim(thigh, legDir(va, side, l.flex, l.abd), l.w, null);
      this.aim(calf, legDir(va, side, l.flex - l.knee, l.abd), l.w, w);
    }
  }

  /** Puts back the bones no clip moves, before a new pose goes on. */
  rest(): void {
    for (const [u, l] of this.limbs) {
      if (u.still) u.bone.quaternion.copy(u.restLocal);
      if (l.still) l.bone.quaternion.copy(l.restLocal);
    }
    for (const j of this.spine) if (j.still) j.bone.quaternion.copy(j.restLocal);
    if (this.neck?.still) this.neck.bone.quaternion.copy(this.neck.restLocal);
  }

  /**
   * Turns joint j to point along `dir` (body space) by weight w. `parent` is the parent's
   * body-space rotation if already known. Returns the joint's new body-space rotation.
   */
  private aim(j: Joint, dir: Vector3, w: number, parent: Quaternion | null): Quaternion {
    const pw = parent ? qa.copy(parent) : this.bodyQuat(j.bone.parent, qa);
    const now = qb.copy(pw).multiply(j.bone.quaternion);
    const target = qc.setFromUnitVectors(j.dir, dir).multiply(j.rest);
    now.slerp(target, w);
    j.bone.quaternion.copy(pw.invert()).multiply(now);
    return parent ? parent.copy(now) : out.copy(now);
  }

  /** Turns joint j by `delta` about the body's axes, by weight w. */
  private add(j: Joint, delta: Quaternion, w: number): void {
    const pw = this.bodyQuat(j.bone.parent, qa);
    const d = qb.identity().slerp(delta, w);
    // local' = Pw^-1 * d * Pw * local
    const inv = qc.copy(pw).invert();
    j.bone.quaternion.premultiply(inv.multiply(d).multiply(pw));
  }

  /** o's rotation in the body's space. */
  private bodyQuat(o: Object3D | null, outQ: Quaternion): Quaternion {
    outQ.identity();
    for (let n = o; n && n !== this.body; n = n.parent) outQ.premultiply(n.quaternion);
    return outQ;
  }
}


/** An arm's direction: `side` 1 for his left. */
function armDir(v: Vector3, side: number, up: number, fwd: number): Vector3 {
  const cu = Math.cos(up * DEG);
  return v.set(side * cu * Math.cos(fwd * DEG), Math.sin(up * DEG), cu * Math.sin(fwd * DEG));
}

/** A leg's direction, swung forward by flex and out by abd. */
function legDir(v: Vector3, side: number, flex: number, abd: number): Vector3 {
  const ca = Math.cos(abd * DEG);
  return v.set(side * Math.sin(abd * DEG), -Math.cos(flex * DEG) * ca, Math.sin(flex * DEG) * ca);
}
