/**
 * Benchmark entry for the spatial engine. tests/spatial.test.ts bundles this file with
 * Vite and imports the bundle directly, because Vitest's import transform makes the
 * engine run about six times slower than it does in a browser or a worker.
 */
import { createSpatial, stepSpatial } from '../../src/sim/spatial/engine';
import type { SpatialMode, SpatialSetup } from '../../src/sim/spatial/types';

/** Play a whole match and return the number of steps. */
export function playMatch(setup: SpatialSetup, seed: string, mode: SpatialMode): number {
  const m = createSpatial(setup, seed, mode);
  while (stepSpatial(m)) { /* keep stepping */ }
  return m.steps;
}

/** Play the first `minutes` of a match. */
export function playMinutes(setup: SpatialSetup, seed: string, mode: SpatialMode, minutes: number): number {
  const m = createSpatial(setup, seed, mode);
  const end = minutes * 60000;
  while (m.clockMs < end && stepSpatial(m)) { /* keep stepping */ }
  return m.steps;
}
