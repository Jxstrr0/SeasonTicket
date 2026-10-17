/**
 * Season entry for the slow believability runs (tests/slow). Bundled with Vite and
 * imported natively for the same reason as spatialBench.ts: under Vitest's import
 * transform the spatial engine runs several times slower than it does in the game.
 */
import { createLeague } from '../../src/sim/league';
import { createSeason, defaultHooks, runSeason, type SeasonState } from '../../src/sim/season';
import { simulateSpatialMatch } from '../../src/sim/spatial/bridge';
import type { SpatialMode } from '../../src/sim/spatial/types';

/** A real generated league played to the end of its playoffs on the spatial engine. */
export function playSeason(seed: string, mode: SpatialMode): SeasonState {
  const hooks = {
    ...defaultHooks(),
    simulate: (setup: Parameters<typeof simulateSpatialMatch>[0], ctx: Parameters<typeof simulateSpatialMatch>[1]) => {
      const result = simulateSpatialMatch(setup, ctx, mode);
      // The suite only reads results; replays would hold every match's setup in memory.
      delete result.replay;
      return result;
    },
  };
  return runSeason(createSeason(createLeague(seed)), hooks);
}
