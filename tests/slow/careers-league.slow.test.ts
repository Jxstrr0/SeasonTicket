/** The league around the careers (docs/STAGE_7_POLISH.md, 7.3): no drift in strength or age over ten seasons, a youth intake in its band, strong squads winning, and fans and crowds that respond. Minutes long: npm run test:slow. */
import { describe, expect, it } from 'vitest';
import type { CareerRun } from '../bench/careerBench';
import type { TierId } from '../../src/sim/career';
import { careers, clubsOf, summary, useCareerBench } from '../helpers/careerSuite';

useCareerBench();
const LONG = 1_800_000;
const TIERS: TierId[] = ['easy', 'normal', 'hard', 'veryHard'];
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('the league over ten seasons', () => {
  const runs: CareerRun[] = [];
  it('plays a careful career at one club of each difficulty', async () => {
    for (const tier of TIERS) runs.push(...(await careers(tier, clubsOf(tier).slice(0, 1), 'careful', [1], 10)));
    console.log(summary(runs));
    expect(runs.every((r) => r.seasons.length === 10)).toBe(true);
  }, LONG);

  it('the league gets no more than 7 points stronger and its average age stays 23 to 28', () => {
    for (const r of runs) {
      const first = r.seasons[0], last = r.seasons[r.seasons.length - 1];
      expect(last.leagueElevenAvg - first.leagueElevenAvg).toBeLessThanOrEqual(7);
      expect(last.leagueElevenAvg - first.leagueElevenAvg).toBeGreaterThanOrEqual(-3);
      expect(last.leagueAge).toBeGreaterThanOrEqual(23);
      expect(last.leagueAge).toBeLessThanOrEqual(28);
    }
  });

  it('the youth intake averages 30 to 45 overall and 50 to 70 potential', () => {
    const intakes = runs.flatMap((r) => r.seasons.map((s) => s.youth)).filter((y) => y.n > 0);
    expect(intakes.length).toBeGreaterThan(0);
    const overall = mean(intakes.map((y) => y.overall)), potential = mean(intakes.map((y) => y.potential));
    console.log(`youth: overall ${overall.toFixed(1)}, potential ${potential.toFixed(1)}`);
    expect(overall).toBeGreaterThanOrEqual(30);
    expect(overall).toBeLessThanOrEqual(45);
    expect(potential).toBeGreaterThanOrEqual(50);
    expect(potential).toBeLessThanOrEqual(70);
  });

  it('one of the four strongest squads wins the table most seasons', () => {
    const seasons = runs.flatMap((r) => r.seasons);
    expect(seasons.filter((s) => s.shieldWinnerRank <= 4).length / seasons.length).toBeGreaterThanOrEqual(0.6);
    expect(seasons.filter((s) => s.championRank <= 4).length / seasons.length).toBeGreaterThanOrEqual(0.5);
  });

  it('fans are happier in top-half seasons, and crowds are not always full', () => {
    const seasons = runs.flatMap((r) => r.seasons);
    const top = seasons.filter((s) => s.position <= 8), bottom = seasons.filter((s) => s.position > 8);
    if (top.length && bottom.length) expect(mean(top.map((s) => s.fanMood))).toBeGreaterThan(mean(bottom.map((s) => s.fanMood)));
    expect(seasons.filter((s) => s.attendance >= 0.99).length / seasons.length).toBeLessThan(0.5);
  });
});
