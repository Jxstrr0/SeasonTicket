import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import { C, advanceCareer, createCareer, setTicketPrice, startUserMatch, stepLiveMinute, userFixture, type Career } from '../src/sim/career';
import { simulateMatch } from '../src/sim/match/engine';
import type { MatchJob, MatchRunner } from '../src/game/matchRunner';
import { WeekPlayer } from '../src/game/week';

/** A runner that plays on the Stage 1 engine, like quickCareer's background matches, and counts its matches. */
function countingRunner(fail?: (job: MatchJob) => boolean): MatchRunner & { played: number } {
  const runner = {
    kind: 'inThread' as const,
    played: 0,
    async run(jobs: readonly MatchJob[]) {
      await Promise.resolve();
      return jobs.map((job) => {
        if (fail?.(job)) throw new Error('worker lost');
        runner.played++;
        return simulateMatch(job.setup, job.ctx);
      });
    },
    dispose() {},
  };
  return runner;
}

function inSeason(seed: number): Career {
  const club = (C.tiers.normal.clubs as string[])[0];
  const career = createCareer({ seed, teamId: club, tier: 'normal', homegrownRule: false });
  while (career.phase === 'preseason') advanceCareer(career);
  return career;
}

const snapshot = (career: Career) => JSON.parse(JSON.stringify(career));

describe('playing a week in the background', () => {
  it('ends the week exactly as advanceCareer does', async () => {
    const a = inSeason(61);
    const b = inSeason(61);
    const runner = countingRunner();
    const weeks = new WeekPlayer(() => runner);
    for (let i = 0; i < 3; i++) {
      const sync = advanceCareer(a);
      const async = await weeks.playWeek(b);
      expect(async).toEqual(sync);
      expect(weeks.playing).toBe(false);
    }
    expect(snapshot(b)).toEqual(snapshot(a));
    expect(runner.played).toBe(3 * 8);
  });

  it('uses the matches played early, and plays again any whose input changed', async () => {
    const a = inSeason(62);
    const b = inSeason(62);
    // A week where the user is at home, so the ticket price changes that match.
    while (userFixture(a)?.homeId !== a.userTeamId) {
      advanceCareer(a);
      advanceCareer(b);
    }
    const runner = countingRunner();
    const weeks = new WeekPlayer(() => runner);
    weeks.warm(b);
    await new Promise((r) => setTimeout(r, 0));
    expect(runner.played).toBe(8);
    const price = b.books[b.userTeamId].ticketPrice + 5;
    expect(setTicketPrice(a, price).ok).toBe(true);
    expect(setTicketPrice(b, price).ok).toBe(true);
    advanceCareer(a);
    await weeks.playWeek(b);
    // Only the user's home match played again.
    expect(runner.played).toBe(9);
    expect(snapshot(b)).toEqual(snapshot(a));
    // Warming twice in one week starts nothing new.
    weeks.warm(b);
    weeks.warm(b);
    await new Promise((r) => setTimeout(r, 0));
    expect(runner.played).toBe(17);
  });

  it('leaves the watched match out of the background and sees it out at the end', async () => {
    const b = inSeason(63);
    startUserMatch(b);
    for (let i = 0; i < 30; i++) stepLiveMinute(b);
    const runner = countingRunner();
    const results = await new WeekPlayer(() => runner).playWeek(b);
    expect(runner.played).toBe(7);
    expect(results).toHaveLength(8);
    expect(b.liveMatch).toBeNull();
    expect(b.lastUserMatch).not.toBeNull();
  });

  it('plays a match here when the workers fail under it', async () => {
    const b = inSeason(64);
    const before = b.weekIndex;
    let failed = 0;
    const runner = countingRunner(() => failed++ === 0);
    const results = await new WeekPlayer(() => runner).playWeek(b);
    expect(results).toHaveLength(8);
    expect(runner.played).toBe(7);
    expect(b.weekIndex).toBe(before + 1);
  });
});
