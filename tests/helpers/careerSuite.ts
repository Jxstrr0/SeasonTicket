/**
 * Ten-season careers for the Stage 7.3 balance targets (docs/STAGE_7_POLISH.md, Q3).
 * Careers are played by a bundled copy of tests/bench/careerBench.ts imported natively,
 * like the season suites, and on the quick Stage 1 engine: the targets are about money
 * and the lenders, and a coarse-engine career is many times slower. The coarse engine
 * was checked by hand with the same bench (see the doc).
 */
import { afterAll } from 'vitest';
import CAREER from '../../src/data/tuning/career.json';
import type { TierId } from '../../src/sim/career';
import type { CareerRun, OwnerStyle } from '../bench/careerBench';
import { bundleAndImport } from './node.mjs';

type Bench = typeof import('../bench/careerBench');

let loaded: { mod: Bench; cleanup: () => void } | null = null;

/** Call once per test file, at the top level. */
export function useCareerBench(): void {
  afterAll(() => {
    loaded?.cleanup();
    loaded = null;
  });
}

/** The clubs on offer at a difficulty, from the tuning file. */
export const clubsOf = (tier: TierId): string[] => CAREER.tiers[tier].clubs;

export async function careers(tier: TierId, clubs: string[], style: OwnerStyle, seeds: number[], seasons: number): Promise<CareerRun[]> {
  loaded ??= await bundleAndImport<Bench>('tests/bench/careerBench.ts');
  const runs: CareerRun[] = [];
  for (const seed of seeds) for (const club of clubs) runs.push(loaded.mod.playCareer({ tier, club, style, seed, seasons, engine: 'stage1' }));
  return runs;
}

export const lostWithin = (runs: CareerRun[], seasons: number): number => runs.filter((r) => r.lost !== null && r.lost <= seasons).length;

/** One line per career for the test log, so a failing band shows what happened. */
export function summary(runs: CareerRun[]): string {
  return runs.map((r) => `${r.club}/${r.style}/s${r.seed}: ${r.lost === null ? 'kept' : `lost in ${r.lost}`} [${r.seasons.map((s) => s.position).join(' ')}]`).join('\n');
}
