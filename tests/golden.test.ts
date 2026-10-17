/**
 * Golden matches (docs/DESIGN.md 17.9): fixed matches whose outcome is stored, so any change
 * to what the engine plays shows here. Saves keep matches as a recipe (seed, line-ups and
 * changes) tagged with the engine's revision, `engineRev` in src/data/tuning/spatial.json;
 * a change that makes an old recipe play a different match must raise it, or saved matches
 * would replay wrongly. The tuning counts: a changed number changes the matches.
 *
 * After an engine or tuning change: raise engineRev, then `npm run golden` to store the new
 * outcomes. It refuses to store new outcomes under the old revision.
 */
import { describe, expect, it } from 'vitest';
import { SPATIAL_TUNING } from '../src/sim/data';
import { fingerprintOf } from '../src/game/matchRunner';
import { createLeague } from '../src/sim/league';
import { buildMatchSetup, createSeason, defaultHooks, matchContext, matchesForWeek } from '../src/sim/season';
import { createSpatialLive, finalizeSpatial, stepSpatialMinute } from '../src/sim/spatial/bridge';
import { fingerprint } from '../src/sim/spatial/engine';
import type { SpatialMode } from '../src/sim/spatial/types';
import { envFlag, readSource, writeSource } from './helpers/node.mjs';

const FILE = 'tests/golden/spatial.json';

interface Golden {
  engineRev: number;
  matches: Record<string, string>;
}

/** Two league matches in each mode, played as playoff ties so extra time and penalties can come in. */
function play(): Record<string, string> {
  const league = createLeague(5);
  const season = createSeason(league);
  const ctx = matchContext(league);
  const out: Record<string, string> = {};
  const cases: [number, SpatialMode][] = [[0, 'fine'], [3, 'fine'], [1, 'coarse'], [2, 'coarse']];
  const fixtures = matchesForWeek(season, 1);
  for (const [k, mode] of cases) {
    const setup = buildMatchSetup(season, fixtures[k], defaultHooks());
    setup.playoff = true;
    const live = createSpatialLive(setup, ctx, mode);
    for (let n = 0; n < 400 && !live.state.finished; n++) stepSpatialMinute(live);
    const result = finalizeSpatial(live);
    out[`${mode} ${setup.matchId}`] = `${result.homeScore}-${result.awayScore}${result.shootout ? ' pens' : ''} engine ${fingerprint(live.m)} result ${fingerprintOf({ ...result, replay: undefined })}`;
  }
  return out;
}

describe('golden matches', () => {
  it('play as stored for this engine revision', () => {
    const rev = SPATIAL_TUNING.engineRev;
    const stored = JSON.parse(readSource(FILE)) as Golden;
    const now = play();
    if (envFlag('UPDATE_GOLDEN')) {
      const changed = JSON.stringify(now) !== JSON.stringify(stored.matches);
      if (changed && stored.engineRev === rev) {
        throw new Error(`The matches changed but engineRev is still ${rev}: raise it in src/data/tuning/spatial.json first`);
      }
      writeSource(FILE, `${JSON.stringify({ engineRev: rev, matches: now }, null, 2)}\n`);
      return;
    }
    expect(stored.engineRev, `engineRev is ${rev} but the golden matches are for ${stored.engineRev}: run npm run golden`).toBe(rev);
    expect(now, 'The engine plays these matches differently: raise engineRev in src/data/tuning/spatial.json, then run npm run golden').toEqual(stored.matches);
  }, 60_000);
});
