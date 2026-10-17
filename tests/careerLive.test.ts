import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import { C, advanceCareer, createCareer, finishLive, liveOf, startUserMatch, stepLiveFrame, stepLiveMinute, type Career } from '../src/sim/career';
import { decodeSave, encodeSave, migrate } from '../src/game/save';
import { liveSubstitute, liveTactics, userSide, userSideState } from '../src/game/matchday';
import { fingerprint } from '../src/sim/spatial/engine';
import { createMatch } from '../src/sim/match/engine';
import { stepMinute } from './helpers/stage1/engine';
import { matchContext } from '../src/sim/season';

function kickedOff(seed: number): Career {
  const club = (C.tiers.normal.clubs as string[])[0];
  const career = createCareer({ seed, teamId: club, tier: 'normal', homegrownRule: false });
  while (career.phase === 'preseason') advanceCareer(career);
  return career;
}

describe('the live match on the spatial engine', () => {
  it('replays a saved match exactly from its record', () => {
    const career = kickedOff(31);
    startUserMatch(career);
    for (let i = 0; i < 25; i++) stepLiveMinute(career);
    const S = userSideState(career, career.liveMatch!);
    const out = S.onPitch[6];
    const inn = S.bench.find((id) => career.season.league.players[id].position !== 'GK')!;
    expect(liveSubstitute(career, out, inn).ok).toBe(true);
    for (let i = 0; i < 10; i++) stepLiveMinute(career);
    const copy = decodeSave(encodeSave(career));
    expect(copy.liveRecord?.log.length).toBe(1);
    liveOf(copy);
    // Rebuilt from the record, not restarted.
    expect(copy.liveRecord?.base).toBeNull();
    expect(copy.liveMatch).toEqual(JSON.parse(JSON.stringify(career.liveMatch)));
    for (let i = 0; i < 20; i++) {
      stepLiveMinute(career);
      stepLiveMinute(copy);
    }
    expect(copy.liveMatch?.events).toEqual(career.liveMatch?.events);
  });

  it('replays a match watched frame by frame, with changes and a save part-way through a minute', () => {
    const career = kickedOff(34);
    startUserMatch(career);
    for (let i = 0; i < 12; i++) stepLiveMinute(career);
    // The 2D view: a few seconds into the minute, the owner changes the plan, then a sub.
    for (let i = 0; i < 137; i++) expect(stepLiveFrame(career)).toBeNull();
    const now = userSideState(career, career.liveMatch!).tactics.mentality;
    expect(liveTactics(career, { mentality: now >= 4 ? 1 : 5, pressing: 5 }).ok).toBe(true);
    for (let i = 0; i < 211; i++) expect(stepLiveFrame(career)).toBeNull();
    const S = userSideState(career, career.liveMatch!);
    const inn = S.bench.find((id) => career.season.league.players[id].position !== 'GK')!;
    expect(liveSubstitute(career, S.onPitch[7], inn).ok).toBe(true);
    // Out of that minute, then two more played frame by frame, then part of another.
    for (let ended = 0; ended < 3; ) if (stepLiveFrame(career) !== null) ended++;
    for (let i = 0; i < 95; i++) stepLiveFrame(career);
    expect(career.liveRecord?.log.map((e) => e.frame)).toEqual([137, 137, 348]);
    expect(career.liveRecord?.frames).toBe(95);

    const copy = decodeSave(encodeSave(career));
    const rebuilt = liveOf(copy)!;
    expect(copy.liveRecord?.base).toBeNull();
    expect(fingerprint(rebuilt.m)).toBe(fingerprint(liveOf(career)!.m));
    // And it goes on the same, whichever way it is stepped.
    for (let i = 0; i < 15; i++) {
      stepLiveMinute(career);
      stepLiveMinute(copy);
    }
    expect(fingerprint(liveOf(copy)!.m)).toBe(fingerprint(liveOf(career)!.m));
    expect(copy.liveMatch?.events).toEqual(career.liveMatch?.events);
  });

  it('restarts a saved match from where it stood when the engine has changed', () => {
    const career = kickedOff(32);
    startUserMatch(career);
    for (let i = 0; i < 52; i++) stepLiveMinute(career);
    const copy = decodeSave(encodeSave(career));
    copy.liveRecord!.rev = -1;
    const before = JSON.parse(JSON.stringify(copy.liveMatch));
    const live = liveOf(copy)!;
    expect(copy.liveRecord?.base).not.toBeNull();
    const now = copy.liveMatch!;
    expect([now.homeScore, now.awayScore]).toEqual([before.homeScore, before.awayScore]);
    expect(now.period).toBe(before.period);
    expect(Math.abs(now.minute - before.minute)).toBeLessThanOrEqual(1);
    expect(now.events.length).toBe(before.events.length);
    expect(live.m.on.reduce((n, v) => n + v, 0)).toBe(22 - before.home.sentOff.length - before.away.sentOff.length);
    // A restarted match saves and replays too.
    for (let i = 0; i < 5; i++) stepLiveMinute(copy);
    const again = decodeSave(encodeSave(copy));
    liveOf(again);
    expect(again.liveMatch?.events).toEqual(copy.liveMatch?.events);
    const result = finishLive(copy, matchContext(copy.season.league));
    expect(result.homeScore).toBeGreaterThanOrEqual(before.homeScore);
    expect(result.awayScore).toBeGreaterThanOrEqual(before.awayScore);
    expect(copy.liveMatch).toBeNull();
  });

  it('picks up a match saved part-way by the Stage 1 engine, with a man sent off', () => {
    const career = kickedOff(33);
    const setup = JSON.parse(JSON.stringify(startUserMatch(career)!.setup));
    const ctx = matchContext(career.season.league);
    const old = createMatch(setup, ctx);
    for (let i = 0; i < 60; i++) stepMinute(old, ctx);
    const side = userSide(career, old);
    const S = old[side];
    const k = S.onPitch.findIndex((id, slot) => slot > 0 && id !== '');
    const gone = S.onPitch[k];
    S.onPitch[k] = '';
    S.sentOff.push(gone);
    const stayer = S.onPitch.find((id) => id !== '')!;
    const passesBefore = S.stats.passes;
    const minutesBefore = S.playerStats[stayer].minutes;
    career.liveMatch = old;
    career.liveRecord = null;
    const loaded = migrate({ ...JSON.parse(JSON.stringify(career)), version: 2, liveRecord: undefined });
    expect(loaded.liveRecord).toBeNull();
    const live = liveOf(loaded)!;
    expect(loaded.liveRecord?.base).not.toBeNull();
    const s = side === 'home' ? 0 : 1;
    let on = 0;
    for (let k = 0; k < 11; k++) on += live.m.on[s * 11 + k];
    expect(on).toBe(11 - S.sentOff.length);
    expect(loaded.liveMatch?.[side].onPitch.filter((id) => id !== '').length).toBe(11 - S.sentOff.length);
    const result = finishLive(loaded, ctx);
    const team = side === 'home' ? result.stats.home : result.stats.away;
    expect(team.passes).toBeGreaterThan(passesBefore);
    expect(result.playerStats[stayer].minutes).toBeGreaterThan(minutesBefore + 25);
    expect(result.playerStats[gone].minutes).toBe(S.playerStats[gone]?.minutes ?? 0);
  });
});
