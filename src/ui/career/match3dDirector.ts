/**
 * What the 3D match replays, and when (Stage 5.3): goals, big chances and great saves again
 * in slow motion, and in highlights mode every big moment in 3D from its build-up while the 2D pitch
 * plays the rest. Plain logic with no DOM or three.js, so it can be tested;
 * src/ui/career/match3d.ts does the drawing.
 *
 * Times are match ms as the 3D view shows them (behind the engine by the tape's lag).
 */
import { ACT, CHANCE_GREAT, CHANCE_POST, CHANCE_SAVED, type ActionCue } from '../../render/match/types';
import type { CameraKey } from '../../render/match/cameraKeys';
import tuning from '../../data/tuning/match3d.json';

const R = tuning.replays;
const LENGTH = 105;

/** One pass over a moment on one camera; 'preset' is the camera the owner picked. */
export interface Take {
  camera: CameraKey | 'preset';
  /** The behind-the-goal camera's end (-1 the home goal line at x 0, 1 the other). */
  end: number;
  from: number;
  to: number;
  /** Match time per real time (below 1 is slow motion). */
  rate: number;
}

export interface Replay {
  /** A save is a chance the keeper saved. */
  kind: 'goal' | 'chance' | 'save';
  /** When it happened: the goal going in, or the shot being hit. */
  atMs: number;
  /** When the replay should start (as shown). */
  dueMs: number;
  takes: Take[];
}

type TakeSpec = { camera: string; fromS: number; toS: number; rate: number };

function takes(list: readonly TakeSpec[], atMs: number, end: number): Take[] {
  return list.map((t) => ({ camera: t.camera as CameraKey, end, from: atMs + t.fromS * 1000, to: atMs + t.toS * 1000, rate: t.rate }));
}

/** Highlights mode: the moment at real speed from its build-up, on the owner's camera. */
function lead(atMs: number, end: number): Take {
  return { camera: 'preset', end, from: atMs - R.leadS * 1000, to: atMs + R.afterS * 1000, rate: 1 };
}

/**
 * The replay for a goal or shot cue, or null when there is none: any other cue, or a shot
 * too small to replay. `highlights` also replays every big moment from its build-up.
 */
export function replayFor(c: ActionCue, highlights: boolean): Replay | null {
  // The end is the goal the ball went into, or the one nearer where the shot was hit.
  const end = c.x < LENGTH / 2 ? -1 : 1;
  if (c.kind === ACT.GOAL) {
    const slow = takes(highlights ? R.goal.slice(-R.goalTakes) : R.goal, c.atMs, end);
    return { kind: 'goal', atMs: c.atMs, dueMs: c.atMs + R.goalAfter * 1000, takes: highlights ? [lead(c.atMs, end), ...slow] : slow };
  }
  if (c.kind !== ACT.CHANCE) return null;
  const big = c.power >= R.bigChanceXg || (c.flag & (CHANCE_POST | CHANCE_GREAT)) !== 0;
  const moment = big || (c.flag & CHANCE_SAVED) !== 0 || c.power >= R.shotXg;
  if (!big && !(highlights && moment)) return null;
  const slow = big ? takes(R.chance, c.atMs, end) : [];
  const kind = (c.flag & CHANCE_SAVED) !== 0 ? 'save' : 'chance';
  return { kind, atMs: c.atMs, dueMs: c.atMs + R.chanceAfter * 1000, takes: highlights ? [lead(c.atMs, end), ...slow] : slow };
}

export class Director {
  /** Replays waiting to start, oldest first. */
  readonly pending: Replay[] = [];
  private lastCue = 0;

  reset(): void {
    this.pending.length = 0;
    this.lastCue = 0;
  }

  /** Takes in new cues. In a shootout, nothing is replayed. */
  scan(cues: readonly ActionCue[], shootout: boolean, highlights: boolean): void {
    for (const c of cues) {
      if (c.id <= this.lastCue) continue;
      this.lastCue = c.id;
      if (shootout) continue;
      const r = replayFor(c, highlights);
      if (!r) continue;
      if (r.kind === 'goal') {
        // The goal's replay shows the chances and saves just before it.
        const from = Math.min(...r.takes.map((t) => t.from));
        for (let i = this.pending.length - 1; i >= 0; i--) {
          if (this.pending[i].kind !== 'goal' && this.pending[i].atMs >= from) this.pending.splice(i, 1);
        }
      }
      this.pending.push(r);
    }
  }

  /**
   * The replay to start now, if one is due at shown time `ms`. `idle` (the match is not moving)
   * starts one as soon as its moment has been shown.
   */
  due(ms: number, idle: boolean): Replay | null {
    const r = this.pending[0];
    if (!r || ms < (idle ? r.atMs : r.dueMs)) return null;
    this.pending.shift();
    return r;
  }

  /** Forget replays of moments before `ms` (a replay just showed them). */
  dropBefore(ms: number): void {
    while (this.pending.length && this.pending[0].atMs < ms) this.pending.shift();
  }
}
