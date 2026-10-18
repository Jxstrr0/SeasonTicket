/** Careers at the Hard clubs (docs/STAGE_7_POLISH.md, Q3): a careful owner can survive, a reckless one goes within two or three seasons. Minutes long: npm run test:slow. */
import { describe, expect, it } from 'vitest';
import { careers, clubsOf, lostWithin, summary, useCareerBench } from '../helpers/careerSuite';

useCareerBench();
const CLUBS = clubsOf('hard');
const LONG = 1_800_000;

describe('Hard careers', () => {
  it('at least half of careful owners still have the club after ten seasons', async () => {
    const runs = await careers('hard', CLUBS, 'careful', [1], 10);
    console.log(summary(runs));
    expect(lostWithin(runs, 10)).toBeLessThanOrEqual(Math.floor(runs.length / 2));
  }, LONG);

  it('at least half of reckless owners lose the club within three seasons', async () => {
    const runs = await careers('hard', CLUBS, 'reckless', [1, 2], 3);
    console.log(summary(runs));
    expect(lostWithin(runs, 3)).toBeGreaterThanOrEqual(Math.ceil(runs.length / 2));
  }, LONG);
});
