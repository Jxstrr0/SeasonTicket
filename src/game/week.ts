/**
 * Playing a career week off the main thread (docs/DESIGN.md 17.8).
 *
 * playWeek runs the week in three parts: prepareCareerWeek sets up every fixture,
 * the MatchRunner plays the matches nobody is watching in its workers, and
 * settleCareerWeek sees out the user's live match and settles the results. Between
 * the first and last part the career is half way through the week, so the screen
 * takes no taps and nothing saves until it is settled.
 *
 * While the owner browses the menus, warm() sets up the coming week on a copy of the
 * career and starts its matches early. Each match is kept under its whole input (the
 * setup and the players and clubs in it), so when the week is played for real a match
 * whose input has not changed takes the result already played, and one that has
 * changed (a new lineup, a ticket price, an injury) plays again. Same input, same
 * engine, same result: an early match is the match that would have been played.
 */
import { advanceCareer, prepareCareerWeek, settleCareerWeek, type Career } from '../sim/career';
import type { MatchContext } from '../sim/match/state';
import type { MatchResult, MatchSetup } from '../sim/types';
import { matchContextFor, playJob, type MatchJob, type MatchRunner } from './matchRunner';

export type WeekProgress = (done: number, total: number) => void;

export class WeekPlayer {
  private readonly early = new Map<string, Promise<MatchResult>>();
  private warmedCareer: Career | null = null;
  private warmedWeek = -1;
  private busy = false;

  constructor(private readonly runner: () => MatchRunner) {}

  /** True from the start of playWeek until the week is settled. */
  get playing(): boolean {
    return this.busy;
  }

  /** Starts the coming week's matches early, once a week. Safe to call on every screen. */
  warm(career: Career): void {
    if (this.busy || career.phase !== 'season') return;
    if (this.warmedCareer === career && this.warmedWeek === career.weekIndex) return;
    this.warmedCareer = career;
    this.warmedWeek = career.weekIndex;
    this.early.clear();
    let week;
    try {
      week = prepareCareerWeek(structuredClone(career));
    } catch {
      return;
    }
    if (!week) return;
    for (const setup of week.jobs) {
      const p = this.play(setup, week.ctx);
      // An early match that fails just plays again with the week.
      p.catch(() => this.early.delete(keyOf(setup, week.ctx)));
    }
  }

  /** One week forward. The results, as advanceCareer gives them. */
  async playWeek(career: Career, onProgress?: WeekProgress): Promise<MatchResult[]> {
    if (this.busy) throw new Error('A week is already being played');
    if (career.phase !== 'season') return advanceCareer(career);
    this.busy = true;
    try {
      const week = prepareCareerWeek(career);
      if (!week) return advanceCareer(career);
      const total = week.jobs.length;
      let done = 0;
      onProgress?.(done, total);
      const results = await Promise.all(week.jobs.map((setup) =>
        this.play(setup, week.ctx)
          // The workers failed under this match: play it here instead.
          .catch(() => playJob({ setup, ctx: week.ctx }))
          .then((r) => {
            onProgress?.(++done, total);
            return r;
          })));
      this.early.clear();
      this.warmedWeek = -1;
      return settleCareerWeek(career, week, results);
    } finally {
      this.busy = false;
    }
  }

  /** The result for this input: the early one if it was started, else a new one. */
  private play(setup: MatchSetup, ctx: MatchContext): Promise<MatchResult> {
    const key = keyOf(setup, ctx);
    const known = this.early.get(key);
    if (known) {
      // A result is used once: the week settles it (and trims it) in place.
      this.early.delete(key);
      return known;
    }
    const job: MatchJob = { setup, ctx: matchContextFor(setup, ctx), mode: 'coarse' };
    const p = this.runner().run([job]).then((r) => r[0]);
    this.early.set(key, p);
    return p;
  }
}

/** Everything a background match is played from. */
function keyOf(setup: MatchSetup, ctx: MatchContext): string {
  return JSON.stringify([setup, matchContextFor(setup, ctx)]);
}
