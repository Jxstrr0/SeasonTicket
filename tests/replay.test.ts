import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import { C, advanceCareer, createCareer, startUserMatch, stepLiveMinute, type Career } from '../src/sim/career';
import { liveTactics, userSide } from '../src/game/matchday';
import { migrate } from '../src/game/save';
import { simulateMatch } from '../src/sim/match/engine';
import { createLeague } from '../src/sim/league';
import { buildMatchSetup, createSeason, defaultHooks, matchContext, matchesForWeek } from '../src/sim/season';
import { replayProblem, simulateSpatialMatch } from '../src/sim/spatial/bridge';
import { createSpatial, fingerprint, spatialFinished, stepSpatial } from '../src/sim/spatial/engine';
import type { MatchReplay } from '../src/sim/types';
import { WeekPlayer } from '../src/game/week';
import type { MatchJob, MatchRunner } from '../src/game/matchRunner';

/** Play a stored replay to the final whistle; true if it ends where the match did. */
function replays(replay: MatchReplay): boolean {
  const r = structuredClone(replay.record);
  const m = createSpatial(r.setup, r.seed, r.mode, r.actions);
  for (let k = 0; k < 200_000 && !spatialFinished(m); k++) stepSpatial(m);
  return fingerprint(m) === replay.check;
}

function inSeason(seed: number): Career {
  const club = (C.tiers.normal.clubs as string[])[0];
  const career = createCareer({ seed, teamId: club, tier: 'normal', homegrownRule: false });
  while (career.phase === 'preseason') advanceCareer(career);
  return career;
}

describe('match replays', () => {
  it('a finished match carries a replay that plays the same match again', () => {
    const league = createLeague(7);
    const season = createSeason(league);
    const setup = buildMatchSetup(season, matchesForWeek(season, 1)[2], defaultHooks());
    const result = simulateSpatialMatch(setup, matchContext(league), 'coarse');
    expect(result.replay).toBeDefined();
    expect(result.replay!.record.actions.length).toBeGreaterThan(0);
    expect(replayProblem(result.replay!)).toBeNull();
    expect(replays(result.replay!)).toBe(true);
    // One played by another engine revision is refused.
    expect(replayProblem({ ...result.replay!, record: { ...result.replay!.record, rev: -1 } })).toMatch(/older version/);
  }, 30_000);

  it('keeps the replay of the watched match, the owner\'s changes included', () => {
    const career = inSeason(71);
    const live = startUserMatch(career)!;
    for (let i = 0; i < 20; i++) stepLiveMinute(career);
    const side = userSide(career, live);
    const now = (side === 'home' ? live.home : live.away).tactics.mentality;
    expect(liveTactics(career, { mentality: now >= 4 ? 1 : 5 }).ok).toBe(true);
    const id = live.setup.matchId;
    advanceCareer(career);
    const replay = career.replays.club[id];
    expect(replay?.record.mode).toBe('fine');
    expect(replay.record.actions.some((a) => a.type === 'tactics' && a.side === (side === 'home' ? 0 : 1))).toBe(true);
    expect(replays(replay)).toBe(true);
    // Results, the last match included, are kept without it.
    expect(career.lastUserMatch?.replay).toBeUndefined();
    expect(career.season.schedule.matches.find((m) => m.id === id)?.result?.replay).toBeUndefined();
  }, 60_000);

  it('keeps the club\'s matches all season and only the latest round of the others', async () => {
    const career = inSeason(72);
    // Stage 1 matches stand in for the engine, each tagged with a made-up replay.
    const runner: MatchRunner = {
      kind: 'inThread',
      async run(jobs: readonly MatchJob[]) {
        return jobs.map((job) => {
          const r = simulateMatch(job.setup, job.ctx);
          r.replay = { record: { rev: 0, seed: r.matchId, mode: 'coarse', setup: null as never, actions: [] }, tuning: 0, check: r.matchId };
          return r;
        });
      },
      dispose() {},
    };
    const weeks = new WeekPlayer(() => runner);
    const ours = (r: { homeId: string; awayId: string }) => r.homeId === career.userTeamId || r.awayId === career.userTeamId;
    const mine: string[] = [];
    let last: string[] = [];
    for (let w = 0; w < 3; w++) {
      const results = await weeks.playWeek(career);
      mine.push(...results.filter(ours).map((r) => r.matchId));
      last = results.filter((r) => !ours(r)).map((r) => r.matchId);
      expect(results.every((r) => r.replay === undefined)).toBe(true);
    }
    expect(Object.keys(career.replays.club).sort()).toEqual([...mine].sort());
    expect(Object.keys(career.replays.round).sort()).toEqual([...last].sort());
    expect(career.replays.club[mine[0]].check).toBe(mine[0]);
  });

  it('gives an older save an empty set of replays', () => {
    const career = inSeason(73);
    const old = JSON.parse(JSON.stringify(career));
    delete old.replays;
    const loaded = migrate({ ...old, version: 3 });
    expect(loaded.replays).toEqual({ club: {}, round: {} });
  });
});
