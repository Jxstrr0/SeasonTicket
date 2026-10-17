/**
 * Runs the shared season believability suite (./believability.ts) on the spatial engine.
 * Seasons are played by a bundled copy of the engine imported natively (tests/bench/seasonBench.ts),
 * because Vitest's import transform makes the engine several times slower.
 */
import { afterAll } from 'vitest';
import type { SpatialMode } from '../../src/sim/spatial/types';
import { believabilitySuite } from './believability';
import { bundleAndImport } from './node.mjs';

type Bench = typeof import('../bench/seasonBench');

export function spatialSeasonSuite(mode: SpatialMode, seasons: number, opts: { determinism?: boolean } = {}): void {
  let loaded: { mod: Bench; cleanup: () => void } | null = null;
  afterAll(() => loaded?.cleanup());
  const seeds = Array.from({ length: seasons }, (_, i) => `spatial-${mode}-${i + 1}`);
  believabilitySuite(`spatial ${mode}`, seeds, async (seed) => {
    loaded ??= await bundleAndImport<Bench>('tests/bench/seasonBench.ts');
    const t0 = performance.now();
    const state = loaded.mod.playSeason(seed, mode);
    return { seed, state, ms: performance.now() - t0 };
  }, { spatial: true, determinism: opts.determinism });
}
