/**
 * The crowd and the referee (Stage 5.5). Turns what happens in a match (matchMoments.ts)
 * into sounds for the mixer (src/render/audio/matchAudio.ts), played when the screen's
 * clock reaches them, plus a crowd swell that rises as attacks get near a goal.
 *
 * The crowd is the home crowd: a home goal brings the roar, an away goal a groan with the
 * away end cheering in the distance. Which variant of a sound plays, and whether a home
 * crowd boos a foul, never touch the engine's random numbers.
 */
import { MatchAudio, type PlayOptions, type SoundKey } from '../../render/audio/matchAudio';
import { LENGTH, depthOf, type SpatialMatch } from '../../sim/spatial/state';
import tuning from '../../data/tuning/atmosphere.json';
import type { Moment } from './matchMoments';

const T = tuning.sound;

export interface SoundCue extends PlayOptions {
  ms: number;
  key: SoundKey;
  /** Which sound wins when several fall due at once (higher first). */
  prio: number;
  /** A home goal: the beds dip under the roar and the swell stays up. */
  goal?: boolean;
}

/** At most this many sounds start in one screen frame; the rest are dropped. */
const PER_FRAME = 3;
/** A whistle this soon (real ms) after another is the same blast. */
const WHISTLE_GAP_MS = 300;

/** A small, fixed hash of a match time, for choices that should look random. */
function hash(ms: number): number {
  let h = Math.imul(ms | 0, 0x9e3779b1);
  h ^= h >>> 15;
  return (h >>> 0) / 0x1_0000_0000;
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * Math.max(0, Math.min(1, u));

/** The sounds for one moment. */
export function soundsFor(mo: Moment): SoundCue[] {
  const ms = mo.ms;
  const C = T.chance;
  switch (mo.kind) {
    case 'kick':
      return [{ ms, key: 'kick', prio: 0, gain: 0.4 + 0.6 * mo.power, pan: (mo.x / LENGTH * 2 - 1) * T.kickPan, rate: 0.94 + 0.12 * hash(ms) }];
    case 'kickoff':
      return [{ ms, key: 'whistle', prio: 2 }];
    case 'shot': {
      if (mo.side === 0) {
        if (mo.outcome === 'post') return [{ ms, key: 'ooh', prio: 3, gain: C.postGain }];
        if (mo.xg < C.minXg) return [];
        return [{ ms, key: 'ooh', prio: 3, gain: lerp(C.homeGain[0], C.homeGain[1], (mo.xg - C.minXg) / 0.35) }];
      }
      if (mo.xg < C.awayMinXg && mo.outcome !== 'post') return [];
      return [{ ms, key: 'ooh', prio: 3, gain: C.awayGain, rate: 0.92 }];
    }
    case 'goal':
      if (mo.side === 0) return [{ ms, key: 'roar', prio: 5, goal: true }];
      return [
        { ms, key: 'groan', prio: 4 },
        { ms, key: 'roar', prio: 4, gain: T.awayRoar, far: true },
      ];
    case 'spot':
      if (mo.side === 0) return mo.outcome === 'scored' ? [{ ms, key: 'roar', prio: 4, gain: 0.55 }] : [{ ms, key: 'groan', prio: 4 }];
      return mo.outcome === 'scored' ? [{ ms, key: 'groan', prio: 4, gain: 0.45 }] : [{ ms, key: 'roar', prio: 4, gain: 0.7 }];
    case 'event': {
      const e = mo.event;
      switch (e.kind) {
        case 'foul': {
          const out: SoundCue[] = [{ ms, key: 'whistle', prio: 2 }];
          // An away player's foul gets some of the home crowd going.
          if (e.side === 1 && hash(ms) < 0.35) out.push({ ms, key: 'boo', prio: 1, gain: 0.45 });
          return out;
        }
        case 'offside':
          return [{ ms, key: 'whistle', prio: 2 }];
        case 'penalty':
          return e.side === 0 ? [{ ms, key: 'roar', prio: 4, gain: 0.6 }] : [{ ms, key: 'boo', prio: 4 }];
        case 'yellow':
        case 'red':
          if (e.side === 0) return [{ ms, key: 'boo', prio: 3, gain: e.kind === 'red' || e.note === 'second' ? 1 : 0.7 }];
          return e.kind === 'red' || e.note === 'second' ? [{ ms, key: 'roar', prio: 3, gain: 0.4 }] : [];
        case 'whistle':
          if (e.note === 'half' || e.note === 'etHalf') return [{ ms, key: 'whistleLong', prio: 4 }];
          return [{ ms, key: 'whistleEnd', prio: 4 }];
        default:
          return [];
      }
    }
  }
}

/** How loud the swell wants to be with the match as it stands (0 to 1). */
export function exciteOf(m: SpatialMatch): number {
  const E = T.excite;
  const d = depthOf(m.poss, m.ball.x);
  const u = Math.max(0, Math.min(1, (d - E.from) / (E.to - E.from)));
  return m.poss === 0 ? u : u * E.awayWeight;
}

export class MatchSound {
  private readonly audio = new MatchAudio();
  private queue: SoundCue[] = [];
  private level = 0;
  private excite = 0;
  private holdUntil = 0;
  private lastNow = 0;
  private lastWhistle = 0;
  private match: SpatialMatch | null = null;

  /** Volume 0 (off) to 1. */
  setLevel(level: number): void {
    this.level = level;
    this.audio.setLevel(level);
    if (level === 0) this.queue.length = 0;
  }

  get on(): boolean {
    return this.level > 0;
  }

  /** Call from a tap: phones only start sound inside one. */
  unlock(): void {
    this.audio.unlock();
  }

  /** A match screen opened: load the sounds and let them play. */
  prepare(): void {
    this.audio.prepare();
  }

  /** A new match or a jump: forget the sounds waiting. */
  reset(m: SpatialMatch): void {
    this.queue.length = 0;
    this.excite = 0;
    this.holdUntil = 0;
    if (m !== this.match) {
      this.match = m;
      this.audio.setCrowd(m.setup.crowd ?? 0.6);
    }
  }

  /** Queue the sounds for new moments. */
  add(moments: readonly Moment[], speed: number): void {
    if (!this.on) return;
    for (const mo of moments) {
      if (mo.kind === 'kick' && speed > T.kicksUpToSpeed) continue;
      for (const c of soundsFor(mo)) this.queue.push(c);
    }
  }

  /**
   * Play what is due by the screen's match time `atMs`; `running` says whether the match is
   * moving (a paused match keeps a low murmur and starts nothing new).
   */
  play(m: SpatialMatch, atMs: number, running: boolean, now: number): void {
    if (!this.on) return;
    this.audio.setPaused(!running);
    const dt = this.lastNow ? Math.min(0.25, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    if (!running) return;
    const due: SoundCue[] = [];
    let keep = 0;
    for (const c of this.queue) {
      if (c.ms <= atMs) due.push(c);
      else this.queue[keep++] = c;
    }
    this.queue.length = keep;
    if (due.length > PER_FRAME) due.sort((a, b) => b.prio - a.prio).length = PER_FRAME;
    for (const c of due) {
      if (c.key === 'whistle') {
        if (now - this.lastWhistle < WHISTLE_GAP_MS) continue;
        this.lastWhistle = now;
      }
      if (c.goal) {
        this.audio.duckBeds(T.excite.bedDuck, 4);
        this.holdUntil = now + T.excite.goalHoldS * 1000;
      }
      this.audio.play(c.key, c);
    }
    const want = now < this.holdUntil ? 1 : exciteOf(m);
    const tau = want > this.excite ? T.excite.riseS : T.excite.fallS;
    this.excite += (want - this.excite) * (dt > 0 ? 1 - Math.exp(-dt / tau) : 0);
    this.audio.setExcitement(this.excite);
  }

  /** The match is paused: just the murmur. */
  pause(): void {
    this.audio.setPaused(true);
  }

  /** Off match day: silence. */
  stop(): void {
    this.queue.length = 0;
    this.lastNow = 0;
    this.audio.stop();
  }

  /** The page was hidden or shown. */
  sleep(hidden: boolean): void {
    this.audio.sleep(hidden);
  }
}
