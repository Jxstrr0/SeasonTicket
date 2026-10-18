/** Ten-season careers at the Easy clubs (docs/STAGE_7_POLISH.md, Q3): only a reckless owner loses one, and never quickly. Minutes long: npm run test:slow. */
import { describe, expect, it } from 'vitest';
import type { CareerRun } from '../bench/careerBench';
import { careers, clubsOf, lostWithin, summary, useCareerBench } from '../helpers/careerSuite';

useCareerBench();
const CLUBS = clubsOf('easy');
const LONG = 1_800_000;

describe('Easy careers over ten seasons', () => {
  let careful: CareerRun[];
  let idle: CareerRun[];
  let reckless: CareerRun[];

  it('a careful owner never loses the club', async () => {
    careful = await careers('easy', CLUBS, 'careful', [1], 10);
    console.log(summary(careful));
    expect(lostWithin(careful, 10)).toBe(0);
  }, LONG);

  it('an owner who does nothing never loses the club', async () => {
    idle = await careers('easy', CLUBS, 'idle', [1], 10);
    console.log(summary(idle));
    expect(lostWithin(idle, 10)).toBe(0);
  }, LONG);

  it('a reckless owner can lose the club, but not in the first three seasons', async () => {
    reckless = await careers('easy', CLUBS, 'reckless', [1, 2], 10);
    console.log(summary(reckless));
    expect(lostWithin(reckless, 3)).toBe(0);
    expect(lostWithin(reckless, 10)).toBeGreaterThan(0);
  }, LONG);
});
