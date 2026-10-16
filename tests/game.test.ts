import { describe, expect, it } from 'vitest';
import { C, CAREER_VERSION, advanceCareer, createCareer, startUserMatch, type Career, type TierId } from '../src/sim/career';
import {
  SaveError,
  STORAGE_KEY,
  decodeSave,
  deleteSavedCareer,
  encodeSave,
  hasSavedCareer,
  loadCareer,
  migrate,
  saveCareer,
  type SaveStore,
} from '../src/game/save';
import { BIG_CALL_MINUTE, coachInCharge, liveMentality, liveSubstitute, pauseReason, playToEnd, setCoachInCharge, stepLive, userSideState } from '../src/game/matchday';

function newCareer(tier: TierId = 'normal', seed = 21): Career {
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed, teamId: club, tier, homegrownRule: false });
}

function toKickoff(career: Career): void {
  while (career.phase === 'preseason') advanceCareer(career);
}

function memoryStore(): SaveStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

describe('save codes', () => {
  it('round-trips a career exactly', () => {
    const career = newCareer();
    toKickoff(career);
    advanceCareer(career);
    const code = encodeSave(career);
    expect(code.startsWith('ST1:')).toBe(true);
    expect(decodeSave(code)).toEqual(JSON.parse(JSON.stringify(career)));
  });

  it('keeps a live match mid-way, and the restored match plays on identically', () => {
    const career = newCareer();
    toKickoff(career);
    startUserMatch(career);
    for (let i = 0; i < 30; i++) stepLive(career);
    const copy = decodeSave(encodeSave(career));
    for (let i = 0; i < 40; i++) {
      stepLive(career);
      stepLive(copy);
    }
    expect(copy.liveMatch?.events).toEqual(career.liveMatch?.events);
  });

  it('ignores whitespace and line breaks from copying', () => {
    const career = newCareer();
    const code = encodeSave(career);
    const messy = `  ${code.slice(0, 50)}\n${code.slice(50, 120)} \r\n${code.slice(120)}  `;
    expect(decodeSave(messy).userTeamId).toBe(career.userTeamId);
  });

  it('rejects junk and truncated codes with a friendly error', () => {
    const code = encodeSave(newCareer());
    expect(() => decodeSave('hello')).toThrow(SaveError);
    expect(() => decodeSave(code.slice(0, code.length / 2))).toThrow(SaveError);
    expect(() => decodeSave('ST1:@@@@')).toThrow(SaveError);
  });

  it('refuses saves from a newer version and saves with no upgrade path', () => {
    expect(() => migrate({ version: CAREER_VERSION + 1 })).toThrow(/newer version/);
    if (CAREER_VERSION > 0) expect(() => migrate({ version: -1 })).toThrow(SaveError);
  });

  it('is small enough to copy on a phone', () => {
    const career = newCareer();
    toKickoff(career);
    for (let i = 0; i < 10; i++) advanceCareer(career);
    expect(encodeSave(career).length).toBeLessThan(400_000);
  });
});

describe('browser storage', () => {
  it('saves, loads and deletes', () => {
    const store = memoryStore();
    const career = newCareer();
    expect(hasSavedCareer(store)).toBe(false);
    expect(loadCareer(store)).toBeNull();
    expect(saveCareer(career, store)).toBe(true);
    expect(hasSavedCareer(store)).toBe(true);
    expect(loadCareer(store)?.seed).toBe(career.seed);
    deleteSavedCareer(store);
    expect(hasSavedCareer(store)).toBe(false);
  });

  it('reports a full or blocked store instead of throwing', () => {
    const full: SaveStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const career = newCareer();
    expect(saveCareer(career, full)).toBe(false);
    expect(saveCareer(career, null)).toBe(false);
    expect(hasSavedCareer(full)).toBe(false);
    expect(loadCareer(full)).toBeNull();
    expect(() => deleteSavedCareer(full)).not.toThrow();
  });

  it('throws SaveError for a damaged stored save', () => {
    const store = memoryStore();
    store.data[STORAGE_KEY] = 'ST1:broken';
    expect(() => loadCareer(store)).toThrow(SaveError);
  });
});

describe('match day', () => {
  it('big-calls mode pauses for goals, half-time and the second-half call', () => {
    const career = newCareer('normal', 5);
    career.delegation.matchMode = 'bigCalls';
    toKickoff(career);
    const state = startUserMatch(career)!;
    const reasons: { minute: number; reason: string }[] = [];
    let goals = 0;
    for (let i = 0; i < 400 && !state.finished; i++) {
      const { events, pause } = stepLive(career);
      goals += events.filter((e) => e.type === 'goal' || e.type === 'ownGoal' || e.type === 'penaltyScored').length;
      if (pause) reasons.push({ minute: state.minute, reason: pause });
    }
    expect(state.finished).toBe(true);
    expect(reasons.some((r) => r.reason.startsWith('Half-time'))).toBe(true);
    expect(reasons.some((r) => r.minute === BIG_CALL_MINUTE && r.reason.startsWith('Big call'))).toBe(true);
    expect(reasons.length).toBeGreaterThanOrEqual(2 + Math.min(goals, 1));
  });

  it('coach mode never pauses', () => {
    const career = newCareer('normal', 6);
    career.delegation.matchMode = 'coach';
    toKickoff(career);
    const state = startUserMatch(career)!;
    for (let i = 0; i < 400 && !state.finished; i++) expect(stepLive(career).pause).toBeNull();
  });

  it('full mode leaves decisions to the owner and pauses for injuries', () => {
    const career = newCareer('normal', 7);
    toKickoff(career);
    const state = startUserMatch(career)!;
    expect(coachInCharge(career)).toBe(false);
    const injury = { minute: 50, added: 0, type: 'injury' as const, side: state.setup.homeId === career.userTeamId ? ('home' as const) : ('away' as const), teamId: career.userTeamId, playerId: userSideState(career, state).onPitch[3], secondaryPlayerId: null, xg: null, text: '', homeScore: 0, awayScore: 0, highlight: true };
    expect(pauseReason(career, state, [injury])).toMatch(/Injury/);
    setCoachInCharge(career, true);
    expect(coachInCharge(career)).toBe(true);
    setCoachInCharge(career, false);
    expect(coachInCharge(career)).toBe(false);
  });

  it('substitutions and tactics go through the engine rules', () => {
    const career = newCareer('normal', 8);
    toKickoff(career);
    const state = startUserMatch(career)!;
    stepLive(career);
    const S = userSideState(career, state);
    const outId = S.onPitch[5];
    const inId = S.bench.find((id) => career.season.league.players[id].position !== 'GK')!;
    expect(liveSubstitute(career, outId, inId).ok).toBe(true);
    expect(S.onPitch).toContain(inId);
    const again = liveSubstitute(career, outId, S.bench[0]);
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/not on the pitch/);

    expect(liveMentality(career, 5).ok).toBe(true);
    expect(S.tactics.mentality).toBe(5);
    // The change is the coach's new plan too.
    const plan = state.setup.homeId === career.userTeamId ? state.setup.home : state.setup.away;
    expect(plan.tactics.mentality).toBe(5);

    playToEnd(career);
    expect(state.finished).toBe(true);
    expect(liveMentality(career, 3).ok).toBe(false);
    advanceCareer(career);
    expect(career.liveMatch).toBeNull();
    expect(career.lastUserMatch?.events.some((e) => e.type === 'substitution' && e.secondaryPlayerId === inId)).toBe(true);
  });
});
