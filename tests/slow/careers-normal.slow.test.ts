/** Ten-season careers at the Normal clubs (docs/STAGE_7_POLISH.md, Q3): about half of reckless owners lose the club within five seasons; careful ones never do. Minutes long: npm run test:slow. */
import { describe, expect, it } from 'vitest';
import type { CareerRun } from '../bench/careerBench';
import { careers, clubsOf, lostWithin, summary, useCareerBench } from '../helpers/careerSuite';

useCareerBench();
const CLUBS = clubsOf('normal');
const LONG = 1_800_000;

describe('Normal careers', () => {
  it('a careful owner never loses the club in ten seasons', async () => {
    const runs = await careers('normal', CLUBS, 'careful', [1], 10);
    console.log(summary(runs));
    expect(lostWithin(runs, 10)).toBe(0);
  }, LONG);

  it('an owner who does nothing keeps the club for ten seasons', async () => {
    const runs = await careers('normal', CLUBS, 'idle', [1], 10);
    console.log(summary(runs));
    expect(lostWithin(runs, 10)).toBe(0);
  }, LONG);

  it('a quarter to three quarters of reckless owners lose the club within five seasons', async () => {
    const runs: CareerRun[] = await careers('normal', CLUBS, 'reckless', [1, 2], 5);
    console.log(summary(runs));
    const share = lostWithin(runs, 5) / runs.length;
    expect(share).toBeGreaterThanOrEqual(0.25);
    expect(share).toBeLessThanOrEqual(0.75);
  }, LONG);
});
