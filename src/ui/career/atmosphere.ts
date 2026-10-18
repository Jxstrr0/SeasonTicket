/**
 * Match-day atmosphere (Stage 5.5): the crowd and referee's sound and the commentary ticker,
 * fed from one watch on the match. One of these is shared by the live and replay screens (like
 * the 3D view). The hosts show it the engine after every step (`observe`) and once per screen
 * frame (`show`, with the match time on screen); the text-only live screen calls `show` once
 * per minute and gets the sound without the ticker.
 */
import type { SpatialMatch } from '../../sim/spatial/state';
import { PERIOD, type Side } from '../../sim/spatial/types';
import tuning from '../../data/tuning/atmosphere.json';
import { matchKits } from '../pitch2d';
import { MomentWatch, type Moment } from './matchMoments';
import { MatchSound } from './matchSound';
import { Ticker } from './ticker';

/**
 * Whether a match kicks off under the floodlights: every playoff, and a fixed share of league
 * matches picked by a hash of the match id, so a match and its replay always agree.
 */
export function nightMatch(matchId: string, playoff: boolean): boolean {
  if (playoff) return tuning.night.playoffs;
  let h = 0x811c9dc5;
  for (let i = 0; i < matchId.length; i++) h = Math.imul(h ^ matchId.charCodeAt(i), 0x01000193);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 0x1_0000_0000 < tuning.night.leagueShare;
}

export class Atmosphere {
  readonly sound = new MatchSound();
  private readonly ticker = new Ticker();
  private readonly watch = new MomentWatch();
  private readonly fresh: Moment[] = [];
  private m: SpatialMatch | null = null;
  private speed = 1;
  /** Goals waiting for the screen's clock: when each was seen, and who scored. */
  private goals: { ms: number; side: Side }[] = [];
  /** Called when a goal reaches the screen (the 3D crowd jumps for a home goal). */
  onGoal: ((side: Side) => void) | null = null;

  /**
   * Match `m` is on screen, with the ticker inside `host` (null for none, as on the text-only
   * live screen). A different match starts again from where it stands.
   */
  attach(host: HTMLElement | null, m: SpatialMatch): void {
    if (host && this.ticker.el.parentElement !== host) host.append(this.ticker.el);
    if (!host) this.ticker.el.remove();
    if (m !== this.m) {
      this.m = m;
      const kits = matchKits(m.setup);
      this.ticker.setKits(kits[0].fill, kits[1].fill);
      this.skip(m);
    }
    this.sound.prepare();
  }

  /** Takes the ticker out of `host` (if it is there). */
  detach(host: HTMLElement): void {
    if (this.ticker.el.parentElement === host) this.ticker.el.remove();
  }

  /** Off match day: silence, and forget the match. */
  stop(): void {
    if (!this.m) return;
    this.m = null;
    this.ticker.reset();
    this.ticker.el.remove();
    this.sound.stop();
    this.goals.length = 0;
  }

  /** The screen jumped to another moment: nothing from before plays. */
  skip(m: SpatialMatch): void {
    if (m !== this.m) return;
    this.watch.skip(m);
    this.sound.reset(m);
    this.ticker.reset();
    this.goals.length = 0;
  }

  /** Call with the engine after each step (or before the next one). */
  observe(m: SpatialMatch): void {
    if (m !== this.m) return;
    this.fresh.length = 0;
    this.watch.observe(m, this.fresh);
    if (!this.fresh.length) return;
    this.sound.add(this.fresh, this.speed);
    this.ticker.add(m, this.fresh);
    for (const mo of this.fresh) if (mo.kind === 'goal') this.goals.push({ ms: mo.ms, side: mo.side });
  }

  /**
   * Once per screen frame: the match time on screen (`atMs`), whether the match is moving,
   * and how fast (match seconds per real second).
   */
  show(m: SpatialMatch, atMs: number, running: boolean, speed: number, now: number): void {
    if (m !== this.m) return;
    // Once the match is over the screens stop moving, and a 3D view that runs a little
    // behind would never reach the final whistle: let everything left play, and the crowd
    // carry on.
    if (m.period === PERIOD.DONE) {
      atMs = Math.max(atMs, m.clockMs);
      running = true;
    }
    this.speed = speed;
    this.observe(m);
    this.sound.play(m, atMs, running, now);
    this.ticker.show(atMs, now);
    while (this.goals.length && this.goals[0].ms <= atMs) {
      const g = this.goals.shift() as { side: Side };
      this.onGoal?.(g.side);
    }
  }

  /** The match was paused: just the murmur. */
  pause(): void {
    if (this.m) this.sound.pause();
  }
}
