/**
 * Spatial match engine time budgets (docs/DESIGN.md 17.11).
 *
 * These run on their own (`npm run test:perf`, its own CI step) rather than with the other
 * test files, which run in parallel and would compete for the same CPU. The engine is
 * bundled and imported natively: vitest's module transform makes hot loops several times
 * slower than real builds. Each timing is the best of a few runs, so one hiccup on a shared
 * CI machine does not fail the build; the budgets themselves are unchanged.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { bundleAndImport, countGcs, envFlag } from '../helpers/node.mjs';
import { setup } from '../helpers/spatialFixtures';

describe('spatial benchmarks', () => {
  type Bench = typeof import('../bench/spatialBench');
  let loaded: { mod: Bench; cleanup: () => void } | null = null;
  async function load(): Promise<Bench> {
    if (!loaded) loaded = await bundleAndImport<Bench>('tests/bench/spatialBench.ts');
    return loaded.mod;
  }
  afterAll(() => loaded?.cleanup());

  /** Fastest of `runs` timings of fn, in milliseconds. */
  const best = (runs: number, fn: (run: number) => void): number => {
    let t = Infinity;
    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      fn(r);
      t = Math.min(t, performance.now() - t0);
    }
    return t;
  };

  it('fine match, league week and season fit their budgets', async () => {
    const b = await load();
    const s = setup();
    // Warm up the JIT the way a long session would.
    b.playMinutes(s, 'warm', 'fine', 20);
    b.playMinutes(s, 'warm', 'coarse', 45);

    const full = envFlag('BENCH_FULL');
    const fine = best(2, (r) => b.playMatch(s, `bench-fine-${r}`, 'fine'));
    const week = best(3, (r) => { for (let k = 0; k < 8; k++) b.playMatch(s, `bench-week-${r}-${k}`, 'coarse'); });
    const seasonMatches = 245;
    const season = full
      ? best(1, () => { for (let k = 0; k < seasonMatches; k++) b.playMatch(s, `bench-season-${k}`, 'coarse'); })
      : (week / 8) * seasonMatches;
    console.log(
      `[spatial bench] fine match ${fine.toFixed(0)} ms (budget 750), ` +
      `league week ${week.toFixed(0)} ms (budget 1000), ` +
      `season ${(season / 1000).toFixed(1)} s ${full ? 'measured' : 'estimated'} (budget 31)`,
    );
    expect(fine).toBeLessThan(750);
    expect(week).toBeLessThan(1000);
    expect(season).toBeLessThan(31_000);
  }, 120_000);

  it('a fine match causes few garbage collections', async () => {
    const b = await load();
    const s = setup();
    b.playMinutes(s, 'warm-gc', 'fine', 10);
    const gcs = await countGcs(() => b.playMatch(s, 'bench-gc', 'fine'));
    console.log(`[spatial bench] garbage collections in one fine match: ${gcs} (budget 20)`);
    expect(gcs).toBeLessThanOrEqual(20);
  }, 60_000);
});
