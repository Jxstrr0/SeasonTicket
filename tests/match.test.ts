/**
 * Match engine tests: determinism, believability over hundreds of seeded
 * matches, internal consistency of the stats, the substitution and shootout
 * rules, plain-JSON state, and the direction of every tactical lever.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, createMatch, finalizeMatch, isFinished, simulateMatch, stepMinute } from '../src/sim/match/engine';
import type { MatchContext, MatchState, Period, SideState } from '../src/sim/match/state';
import { effective, sideStrength, weightedAttributes } from '../src/sim/match/strength';
import { formation } from '../src/sim/data';
import type { MatchEvent, MatchResult, MatchSetup, Side, Tactics } from '../src/sim/types';
import { contextOf, makeSetup, makeTeam } from './helpers/matchFixtures';

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

makeTeam('alpha', 0.6, 1);
makeTeam('beta', 0.6, 2);
makeTeam('strong', 0.85, 3);
makeTeam('weak', 0.35, 4);
const ctx: MatchContext = contextOf('alpha', 'beta', 'strong', 'weak');

const SIDES: readonly Side[] = ['home', 'away'];
const MAX_STEPS = 400;

interface Played {
  setup: MatchSetup;
  state: MatchState;
  result: MatchResult;
}

/** Plays a match step by step so the final state is available alongside the result. */
function play(setup: MatchSetup, context: MatchContext = ctx): Played {
  const state = runUntil(createMatch(setup, context), () => false, context);
  return { setup, state, result: finalizeMatch(state, context) };
}

/** Steps the match until `stop` returns true or the match ends. */
function runUntil(state: MatchState, stop: (s: MatchState) => boolean, context: MatchContext = ctx): MatchState {
  let steps = 0;
  while (!isFinished(state) && !stop(state)) {
    stepMinute(state, context);
    steps += 1;
    if (steps > MAX_STEPS) throw new Error('match did not finish');
  }
  return state;
}

/** Equal-quality league matches with the venue alternating so squad differences cancel out. */
function equalMatch(seed: number, overrides: Partial<MatchSetup> = {}): MatchSetup {
  return seed % 2 === 1 ? makeSetup('alpha', 'beta', seed, overrides) : makeSetup('beta', 'alpha', seed, overrides);
}

/** alpha (home, human-managed so the coach never touches the tactic) against beta with home tactics overridden. */
function tacticSetup(seed: number, tactics: Partial<Tactics>, overrides: Partial<MatchSetup> = {}): MatchSetup {
  const setup = makeSetup('alpha', 'beta', seed, { aiControlled: { home: false, away: false }, ...overrides });
  setup.home.tactics = { ...setup.home.tactics, ...tactics };
  return setup;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
}

function seeds(count: number, from = 1): number[] {
  return Array.from({ length: count }, (_, i) => from + i);
}

function averageOver(count: number, from: number, setup: (seed: number) => MatchSetup, measure: (p: Played) => number): number {
  return mean(seeds(count, from).map((seed) => measure(play(setup(seed)))));
}

function sideOf(state: MatchState, side: Side): SideState {
  return side === 'home' ? state.home : state.away;
}

function averageEnergyOnPitch(side: SideState): number {
  const ids = side.onPitch.filter((id) => id !== '');
  return mean(ids.map((id) => side.fatigue[id]));
}

function eventsOf(result: MatchResult, ...types: MatchEvent['type'][]): MatchEvent[] {
  return result.events.filter((e) => types.includes(e.type));
}

/** Ticks played: regulation and extra-time minutes plus every stoppage minute the closing whistles record. */
function ticksPlayed(result: MatchResult): number {
  const closers = eventsOf(result, 'halfTime', 'fullTime', 'extraTimeHalf', 'extraTimeEnd');
  const regulation = result.extraTime ? 120 : 90;
  return regulation + closers.reduce((sum, e) => sum + e.added, 0);
}

/** Which tick (1-based) an event happened in, counting stoppage minutes of earlier periods. */
function tickIndex(result: MatchResult, event: MatchEvent): number {
  const earlier = eventsOf(result, 'halfTime', 'fullTime', 'extraTimeHalf').filter((closer) => closer.minute < event.minute);
  return event.minute + event.added + earlier.reduce((sum, e) => sum + e.added, 0);
}

function sideTeam(result: MatchResult, side: Side): string {
  return side === 'home' ? result.homeId : result.awayId;
}

function playerIdsOfSide(played: Played, side: Side): string[] {
  const selection = side === 'home' ? played.setup.home : played.setup.away;
  return [...selection.lineup.starters, ...selection.lineup.bench];
}

/** Scans seeds for a match that satisfies `want`; the scan is bounded so a broken engine fails rather than hangs. */
function findMatch(from: number, limit: number, setup: (seed: number) => MatchSetup, want: (p: Played) => boolean): Played {
  for (const seed of seeds(limit, from)) {
    const played = play(setup(seed));
    if (want(played)) return played;
  }
  throw new Error(`no match in ${limit} seeds satisfied the condition`);
}

// One shared batch of equal-quality matches feeds every believability check.
const BATCH: Played[] = seeds(400).map((seed) => play(equalMatch(seed)));
const RESULTS = BATCH.map((p) => p.result);
const TEAM_STATS = RESULTS.flatMap((r) => [r.stats.home, r.stats.away]);

// ---------------------------------------------------------------------------
// Determinism and plain-JSON state
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('gives deep-equal results for the same setup', () => {
    for (const seed of [7, 99, 2024]) {
      const first = simulateMatch(equalMatch(seed), ctx);
      const second = simulateMatch(equalMatch(seed), ctx);
      expect(second).toEqual(first);
    }
  });

  it('gives different matches for different seeds', () => {
    const texts = new Set(seeds(20).map((seed) => JSON.stringify(simulateMatch(equalMatch(seed), ctx).events.map((e) => e.type))));
    expect(texts.size).toBe(20);
  });

  it('stepping by hand matches simulateMatch exactly', () => {
    const setup = equalMatch(31);
    expect(play(setup).result).toEqual(simulateMatch(setup, ctx));
  });

  it('a JSON round trip mid-match continues to the same result', () => {
    for (const [seed, minute] of [[5, 1], [12, 46], [44, 75], [61, 90]] as const) {
      const setup = equalMatch(seed);
      const reference = simulateMatch(setup, ctx);
      const state = runUntil(createMatch(setup, ctx), (s) => s.minute >= minute);
      const revived = JSON.parse(JSON.stringify(state)) as MatchState;
      expect(revived).toEqual(state);
      expect(play2(revived)).toEqual(reference);
    }
  });

  it('a JSON round trip in extra time and before the shootout continues to the same result', () => {
    const playoff = (seed: number) => equalMatch(seed, { playoff: true });
    const shootoutMatch = findMatch(1, 300, playoff, (p) => p.result.shootout !== null);
    const reference = shootoutMatch.result;
    for (const stop of [(s: MatchState) => s.minute >= 100, (s: MatchState) => s.period === 'shootout']) {
      const state = runUntil(createMatch(shootoutMatch.setup, ctx), stop);
      const revived = JSON.parse(JSON.stringify(state)) as MatchState;
      expect(play2(revived)).toEqual(reference);
    }
  });

  it('the state holds only plain JSON values', () => {
    const state = runUntil(createMatch(equalMatch(3), ctx), (s) => s.minute >= 60);
    const check = (value: unknown, path: string): void => {
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        if (typeof value === 'number') expect(Number.isFinite(value), path).toBe(true);
        return;
      }
      expect(typeof value, path).toBe('object');
      const proto = Object.getPrototypeOf(value);
      expect(proto === Object.prototype || proto === Array.prototype, path).toBe(true);
      for (const [key, child] of Object.entries(value as object)) {
        expect(child, `${path}.${key}`).not.toBeUndefined();
        check(child, `${path}.${key}`);
      }
    };
    check(state, 'state');
  });
});

/** Finishes an already-created state and returns its result. */
function play2(state: MatchState): MatchResult {
  return finalizeMatch(runUntil(state, () => false), ctx);
}

// ---------------------------------------------------------------------------
// Believability over 400 equal-quality matches
// ---------------------------------------------------------------------------

describe('believability (400 equal-quality matches)', () => {
  it('scores 2.3 to 3.2 goals per match and never more than 10', () => {
    const goals = RESULTS.map((r) => r.homeScore + r.awayScore);
    expect(mean(goals)).toBeGreaterThanOrEqual(2.3);
    expect(mean(goals)).toBeLessThanOrEqual(3.2);
    expect(Math.max(...goals)).toBeLessThanOrEqual(10);
    // Goalless draws and big scores both happen.
    expect(goals.filter((g) => g === 0).length).toBeGreaterThan(0);
    expect(goals.filter((g) => g >= 5).length).toBeGreaterThan(0);
  });

  it('splits results about 45% home, 25% draw', () => {
    const homeWins = RESULTS.filter((r) => r.homeScore > r.awayScore).length / RESULTS.length;
    const draws = RESULTS.filter((r) => r.homeScore === r.awayScore).length / RESULTS.length;
    expect(homeWins).toBeGreaterThanOrEqual(0.4);
    expect(homeWins).toBeLessThanOrEqual(0.52);
    expect(draws).toBeGreaterThanOrEqual(0.2);
    expect(draws).toBeLessThanOrEqual(0.32);
  });

  it('records a winner for every decisive league match and none for draws', () => {
    for (const r of RESULTS) {
      if (r.homeScore === r.awayScore) expect(r.winnerId).toBeNull();
      else expect(r.winnerId).toBe(r.homeScore > r.awayScore ? r.homeId : r.awayId);
      expect(r.extraTime).toBe(false);
      expect(r.shootout).toBeNull();
    }
  });

  it('produces 8 to 17 shots per team, 30-45% on target, 0.9 to 1.9 xG', () => {
    const shots = TEAM_STATS.reduce((s, t) => s + t.shots, 0);
    const onTarget = TEAM_STATS.reduce((s, t) => s + t.shotsOnTarget, 0);
    expect(shots / TEAM_STATS.length).toBeGreaterThanOrEqual(8);
    expect(shots / TEAM_STATS.length).toBeLessThanOrEqual(17);
    expect(onTarget / shots).toBeGreaterThanOrEqual(0.3);
    expect(onTarget / shots).toBeLessThanOrEqual(0.45);
    const xg = mean(TEAM_STATS.map((t) => t.xg));
    expect(xg).toBeGreaterThanOrEqual(0.9);
    expect(xg).toBeLessThanOrEqual(1.9);
  });

  it('gives possession shares that sum to 1 and average 0.35-0.65 between equal teams', () => {
    for (const r of RESULTS) {
      expect(r.stats.home.possession + r.stats.away.possession).toBeCloseTo(1, 9);
      expect(r.stats.home.possession).toBeGreaterThan(0);
      expect(r.stats.home.possession).toBeLessThan(1);
    }
    const home = mean(RESULTS.map((r) => r.stats.home.possession));
    expect(home).toBeGreaterThanOrEqual(0.35);
    expect(home).toBeLessThanOrEqual(0.65);
  });

  it('shows 1.0 to 3.0 yellow cards and 0.02 to 0.15 red cards per team', () => {
    const yellows = mean(TEAM_STATS.map((t) => t.yellowCards));
    const reds = mean(TEAM_STATS.map((t) => t.redCards));
    expect(yellows).toBeGreaterThanOrEqual(1);
    expect(yellows).toBeLessThanOrEqual(3);
    expect(reds).toBeGreaterThanOrEqual(0.02);
    expect(reds).toBeLessThanOrEqual(0.15);
  });

  it('keeps passes, fouls, corners and ratings in sensible ranges', () => {
    expect(mean(TEAM_STATS.map((t) => t.passes))).toBeGreaterThan(250);
    expect(mean(TEAM_STATS.map((t) => t.passes))).toBeLessThan(700);
    for (const t of TEAM_STATS) {
      expect(t.passAccuracy).toBeGreaterThan(0.5);
      expect(t.passAccuracy).toBeLessThan(0.98);
    }
    expect(mean(TEAM_STATS.map((t) => t.fouls))).toBeGreaterThan(6);
    expect(mean(TEAM_STATS.map((t) => t.fouls))).toBeLessThan(18);
    expect(mean(TEAM_STATS.map((t) => t.corners))).toBeGreaterThan(2);
    expect(mean(TEAM_STATS.map((t) => t.corners))).toBeLessThan(9);
    for (const r of RESULTS) {
      for (const p of Object.values(r.playerStats)) {
        expect(p.rating).toBeGreaterThanOrEqual(1);
        expect(p.rating).toBeLessThanOrEqual(10);
      }
    }
  });

  it('lets a 0.85 squad beat a 0.35 squad in at least 65% of matches', () => {
    let strongWins = 0;
    const n = 200;
    for (const seed of seeds(n)) {
      const strongHome = seed % 2 === 1;
      const r = simulateMatch(strongHome ? makeSetup('strong', 'weak', seed) : makeSetup('weak', 'strong', seed), ctx);
      const strongScore = strongHome ? r.homeScore : r.awayScore;
      const weakScore = strongHome ? r.awayScore : r.homeScore;
      if (strongScore > weakScore) strongWins += 1;
    }
    expect(strongWins / n).toBeGreaterThanOrEqual(0.65);
  });

  it('simulates 100 matches in under 2 seconds', () => {
    const start = performance.now();
    for (const seed of seeds(100, 5000)) simulateMatch(equalMatch(seed), ctx);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// Internal consistency
// ---------------------------------------------------------------------------

describe('stats are internally consistent', () => {
  it('goals equal the score, the team stats and the sum of player goals', () => {
    for (const played of BATCH) {
      const r = played.result;
      for (const side of SIDES) {
        const score = side === 'home' ? r.homeScore : r.awayScore;
        const team = r.stats[side];
        const goalEvents = r.events.filter((e) => (e.type === 'goal' || e.type === 'penaltyScored') && e.side === side).length;
        const playerGoals = playerIdsOfSide(played, side).reduce((sum, id) => sum + (r.playerStats[id]?.goals ?? 0), 0);
        expect(team.goals).toBe(score);
        expect(goalEvents).toBe(score);
        expect(playerGoals).toBe(score);
        expect(team.shotsOnTarget).toBeGreaterThanOrEqual(team.goals);
        expect(team.shots).toBeGreaterThanOrEqual(team.shotsOnTarget);
      }
    }
  });

  it('player shots, saves and xG add up to the team totals', () => {
    for (const played of BATCH) {
      const r = played.result;
      for (const side of SIDES) {
        const ids = playerIdsOfSide(played, side);
        const sum = (key: 'shots' | 'shotsOnTarget' | 'xg' | 'tackles' | 'fouls' | 'yellowCards' | 'redCards') =>
          ids.reduce((total, id) => total + (r.playerStats[id]?.[key] ?? 0), 0);
        const team = r.stats[side];
        expect(sum('shots')).toBe(team.shots);
        expect(sum('shotsOnTarget')).toBe(team.shotsOnTarget);
        expect(sum('xg')).toBeCloseTo(team.xg, 9);
        expect(sum('tackles')).toBe(team.tackles);
        expect(sum('fouls')).toBe(team.fouls);
        expect(sum('yellowCards')).toBe(team.yellowCards);
        expect(sum('redCards')).toBe(team.redCards);
        const savesByKeepers = ids.reduce((total, id) => total + (r.playerStats[id]?.saves ?? 0), 0);
        expect(savesByKeepers).toBe(team.saves);
      }
    }
  });

  it('the half-time score and every event score are consistent with the goals', () => {
    for (const r of RESULTS) {
      const firstHalfGoals = (side: Side) => r.events.filter((e) => (e.type === 'goal' || e.type === 'penaltyScored') && e.side === side && e.minute <= 45).length;
      expect(r.halfTimeScore).toEqual({ home: firstHalfGoals('home'), away: firstHalfGoals('away') });
      let home = 0;
      let away = 0;
      for (const e of r.events) {
        if (e.type === 'goal' || e.type === 'penaltyScored') {
          if (e.side === 'home') home += 1;
          else away += 1;
        }
        expect([e.homeScore, e.awayScore]).toEqual([home, away]);
      }
    }
  });

  it('cards in the events match the stats, the booked list and the sent-off list', () => {
    for (const r of RESULTS) {
      for (const side of SIDES) {
        const ofSide = (t: MatchEvent['type']) => r.events.filter((e) => e.type === t && e.side === side);
        expect(r.stats[side].yellowCards).toBe(ofSide('yellowCard').length + ofSide('secondYellow').length);
        expect(r.stats[side].redCards).toBe(ofSide('redCard').length + ofSide('secondYellow').length);
      }
      const sentOff = eventsOf(r, 'redCard', 'secondYellow').map((e) => e.playerId);
      expect(r.sentOff.slice().sort()).toEqual(sentOff.slice().sort());
      for (const id of r.booked) {
        expect(r.events.filter((e) => e.type === 'yellowCard' && e.playerId === id).length).toBe(1);
        expect(eventsOf(r, 'secondYellow').map((e) => e.playerId)).not.toContain(id);
      }
      expect(eventsOf(r, 'injury').length).toBe(r.injuries.length);
    }
  });

  it('minutes per side equal 11 times the ticks played minus the minutes lost to red cards', () => {
    for (const played of BATCH) {
      const r = played.result;
      const ticks = ticksPlayed(r);
      for (const side of SIDES) {
        const minutes = playerIdsOfSide(played, side).reduce((sum, id) => sum + (r.playerStats[id]?.minutes ?? 0), 0);
        const lost = eventsOf(r, 'redCard', 'secondYellow')
          .filter((e) => e.side === side)
          .reduce((sum, e) => sum + (ticks - tickIndex(r, e) + 1), 0);
        expect(Math.abs(minutes - (11 * ticks - lost))).toBeLessThanOrEqual(1);
        for (const id of playerIdsOfSide(played, side)) expect(r.playerStats[id]?.minutes ?? 0).toBeLessThanOrEqual(ticks);
      }
    }
  });

  it('stoppage time is 1 to 6 minutes per half', () => {
    for (const r of RESULTS) {
      for (const e of eventsOf(r, 'halfTime', 'fullTime')) {
        expect(e.added).toBeGreaterThanOrEqual(1);
        expect(e.added).toBeLessThanOrEqual(6);
      }
    }
  });

  it('events run in non-decreasing minute order, start at kickoff and end at full time', () => {
    for (const r of RESULTS) {
      expect(r.events[0].type).toBe('kickoff');
      for (let i = 1; i < r.events.length; i++) {
        const prev = r.events[i - 1];
        const next = r.events[i];
        expect(next.minute * 100 + next.added).toBeGreaterThanOrEqual(prev.minute * 100 + prev.added);
      }
      expect(r.events[r.events.length - 1].type).toBe('fullTime');
      expect(eventsOf(r, 'halfTime').length).toBe(1);
      for (const e of r.events) {
        expect(e.text.length).toBeGreaterThan(0);
        expect(e.text).not.toMatch(/[{}]/);
        if (e.side !== null) expect(e.teamId).toBe(sideTeam(r, e.side));
      }
    }
  });

  it('every shot event carries an xG and the involved player', () => {
    for (const r of RESULTS) {
      for (const e of eventsOf(r, 'goal', 'chance', 'save', 'penaltyScored', 'penaltySaved', 'penaltyMissed')) {
        expect(e.xg).not.toBeNull();
        expect(e.xg!).toBeGreaterThan(0);
        expect(e.xg!).toBeLessThan(1);
        expect(e.playerId).not.toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Substitutions
// ---------------------------------------------------------------------------

describe('substitutions', () => {
  it('AI sides make 2 to 5 subs on average and never more than 5', () => {
    const counts = BATCH.flatMap((p) => SIDES.map((side) => sideOf(p.state, side).subsUsed));
    expect(mean(counts)).toBeGreaterThanOrEqual(2);
    expect(mean(counts)).toBeLessThanOrEqual(5);
    expect(Math.max(...counts)).toBeLessThanOrEqual(5);
  });

  it('substitution events match subsUsed, come from the bench and never involve a sent-off player', () => {
    for (const played of BATCH) {
      const r = played.result;
      for (const side of SIDES) {
        const subs = r.events.filter((e) => e.type === 'substitution' && e.side === side);
        expect(subs.length).toBe(sideOf(played.state, side).subsUsed);
        const bench = (side === 'home' ? played.setup.home : played.setup.away).lineup.bench;
        const cameOn = new Set<string>();
        const wentOff = new Set<string>();
        for (const sub of subs) {
          const inId = sub.secondaryPlayerId!;
          const outId = sub.playerId!;
          // Nobody already sent off at the time of the change takes part in it (a substitute may be sent off later).
          const sentOffBefore = r.events.slice(0, r.events.indexOf(sub)).filter((e) => e.type === 'redCard' || e.type === 'secondYellow').map((e) => e.playerId);
          expect(bench).toContain(inId);
          expect(cameOn.has(inId)).toBe(false);
          expect(wentOff.has(inId)).toBe(false);
          expect(sentOffBefore).not.toContain(inId);
          expect(sentOffBefore).not.toContain(outId);
          cameOn.add(inId);
          wentOff.add(outId);
        }
        for (const id of wentOff) expect(sideOf(played.state, side).onPitch).not.toContain(id);
      }
    }
  });

  it('human-managed sides get no automatic substitutions or tactic changes', () => {
    for (const seed of seeds(20, 900)) {
      const { result } = play(equalMatch(seed, { aiControlled: { home: false, away: true } }));
      expect(result.events.filter((e) => (e.type === 'substitution' || e.type === 'tacticChange') && e.side === 'home')).toEqual([]);
    }
  });

  it('applyAction throws on a sixth substitution and on a player not on the bench', () => {
    const setup = makeSetup('alpha', 'beta', 77, { aiControlled: { home: false, away: false } });
    const state = runUntil(createMatch(setup, ctx), (s) => s.minute >= 60);
    const starters = state.home.onPitch.filter((id) => id !== '' && ctx.players[id].position !== 'GK');
    const bench = state.home.bench.filter((id) => ctx.players[id].position !== 'GK');
    const opponentBench = state.away.bench[0];

    expect(() => applyAction(state, ctx, { type: 'substitute', side: 'home', outId: starters[0], inId: opponentBench })).toThrow(/bench/);
    expect(() => applyAction(state, ctx, { type: 'substitute', side: 'home', outId: bench[0], inId: bench[1] })).toThrow(/pitch/);
    for (let i = 0; i < 5; i++) {
      const events = applyAction(state, ctx, { type: 'substitute', side: 'home', outId: starters[i], inId: bench[i] });
      expect(events.map((e) => e.type)).toEqual(['substitution']);
      expect(state.home.onPitch).toContain(bench[i]);
      expect(state.home.onPitch).not.toContain(starters[i]);
      // A player taken off cannot come back on.
      if (i === 0) expect(() => applyAction(state, ctx, { type: 'substitute', side: 'home', outId: starters[1], inId: starters[0] })).toThrow(/bench/);
    }
    expect(state.home.subsUsed).toBe(5);
    expect(() => applyAction(state, ctx, { type: 'substitute', side: 'home', outId: starters[5], inId: bench[5] })).toThrow(/substitutions/);
  });

  it('refuses changes after the final whistle', () => {
    const state = runUntil(createMatch(equalMatch(8), ctx), () => false);
    expect(() => applyAction(state, ctx, { type: 'setMentality', side: 'home', mentality: 5 })).toThrow(/finished/);
    expect(stepMinute(state, ctx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Playoffs: extra time and the shootout
// ---------------------------------------------------------------------------

describe('playoffs', () => {
  const playoff = (seed: number) => equalMatch(seed, { playoff: true });
  const playoffHuman = (seed: number) => equalMatch(seed, { playoff: true, aiControlled: { home: false, away: false } });

  it('a level score after 90 minutes goes to extra time and always produces a winner', () => {
    const etMatch = findMatch(1, 200, playoff, (p) => p.result.extraTime);
    const r = etMatch.result;
    expect(eventsOf(r, 'extraTimeStart').length).toBe(1);
    expect(eventsOf(r, 'extraTimeHalf').length).toBe(1);
    expect(eventsOf(r, 'extraTimeEnd').length).toBe(1);
    expect(r.winnerId).not.toBeNull();
    const fullTime = eventsOf(r, 'fullTime')[0];
    expect(fullTime.homeScore).toBe(fullTime.awayScore);
    for (const e of eventsOf(r, 'extraTimeHalf', 'extraTimeEnd')) {
      expect(e.added).toBeGreaterThanOrEqual(0);
      expect(e.added).toBeLessThanOrEqual(2);
    }
  });

  it('playoff matches decided in 90 minutes skip extra time', () => {
    const decided = findMatch(1, 50, playoff, (p) => p.result.homeScore !== p.result.awayScore && !p.result.extraTime);
    expect(eventsOf(decided.result, 'extraTimeStart')).toEqual([]);
    expect(decided.result.events[decided.result.events.length - 1].type).toBe('fullTime');
  });

  it('runs a consistent shootout with a winner after level extra time', () => {
    let shootouts = 0;
    for (const seed of seeds(240)) {
      const played = play(playoff(seed));
      const r = played.result;
      if (!r.shootout) continue;
      shootouts += 1;
      checkShootout(played);
    }
    expect(shootouts).toBeGreaterThanOrEqual(5);
  });

  it('a sent-off player never takes a shootout kick', () => {
    const withRed = findMatch(1, 2000, playoff, (p) => p.result.shootout !== null && p.result.sentOff.length > 0);
    const kickers = eventsOf(withRed.result, 'shootoutKick').map((e) => e.playerId);
    for (const id of withRed.result.sentOff) expect(kickers).not.toContain(id);
    checkShootout(withRed);
  });

  it('caps substitutions at five including extra time, and players taken off in extra time do not kick', () => {
    const outfield = (ids: string[]) => ids.filter((id) => id !== '' && ctx.players[id].position !== 'GK');
    const subOne = (state: MatchState): string => {
      const outId = outfield(state.home.onPitch)[0];
      applyAction(state, ctx, { type: 'substitute', side: 'home', outId, inId: outfield(state.home.bench)[0] });
      return outId;
    };
    /** Three subs in normal time, two in extra time; returns what happened, or null if this seed never reaches a shootout. */
    const scenario = (seed: number) => {
      const state = runUntil(createMatch(playoffHuman(seed), ctx), (s) => s.minute >= 60);
      for (let i = 0; i < 3; i++) subOne(state);
      runUntil(state, (s) => s.period === 'etFirstHalf' && s.minute >= 95);
      if (state.period !== 'etFirstHalf') return null;
      const takenOffInEt = [subOne(state), subOne(state)];
      const sixth = () => applyAction(state, ctx, { type: 'substitute', side: 'home', outId: outfield(state.home.onPitch)[0], inId: state.home.bench[0] });
      const subsAfterFive = state.home.subsUsed;
      runUntil(state, (s) => s.period === 'shootout');
      // runUntil mutated the state, so re-read the period without the earlier narrowing.
      if ((state.period as Period) !== 'shootout') return null;
      return { state, takenOffInEt, sixth, subsAfterFive, onPitchAtEnd: state.home.onPitch.slice() };
    };
    const found = seeds(400).reduce<ReturnType<typeof scenario>>((hit, seed) => hit ?? scenario(seed), null);
    expect(found).not.toBeNull();
    const { state, takenOffInEt, sixth, subsAfterFive, onPitchAtEnd } = found!;
    expect(subsAfterFive).toBe(5);
    expect(() => applyAction(state, ctx, { type: 'setMentality', side: 'home', mentality: 4 })).toThrow(/shootout/);
    expect(sixth).toThrow();
    const result = play2(state);
    const homeKickers = result.events.filter((e) => e.type === 'shootoutKick' && e.side === 'home').map((e) => e.playerId!);
    expect(homeKickers.length).toBeGreaterThan(0);
    for (const id of homeKickers) expect(onPitchAtEnd).toContain(id);
    for (const id of takenOffInEt) expect(homeKickers).not.toContain(id);
  });

  it('refuses a sixth substitution in extra time', () => {
    const outfield = (ids: string[]) => ids.filter((id) => id !== '' && ctx.players[id].position !== 'GK');
    const inExtraTime = seeds(200)
      .map((seed) => runUntil(createMatch(playoffHuman(seed), ctx), (s) => s.period === 'etFirstHalf'))
      .find((s) => s.period === 'etFirstHalf')!;
    expect(inExtraTime).toBeDefined();
    for (let i = 0; i < 5; i++) {
      applyAction(inExtraTime, ctx, { type: 'substitute', side: 'away', outId: outfield(inExtraTime.away.onPitch)[0], inId: outfield(inExtraTime.away.bench)[0] });
    }
    expect(() =>
      applyAction(inExtraTime, ctx, { type: 'substitute', side: 'away', outId: outfield(inExtraTime.away.onPitch)[0], inId: inExtraTime.away.bench[0] }),
    ).toThrow(/substitutions/);
  });
});

/** Shootout invariants: kickers were on the pitch at the end, nobody kicks twice early, the score adds up, a winner exists. */
function checkShootout(played: Played): void {
  const r = played.result;
  expect(r.extraTime).toBe(true);
  expect(r.homeScore).toBe(r.awayScore);
  expect(r.shootout).not.toBeNull();
  const shootout = r.shootout!;
  expect(shootout.home).not.toBe(shootout.away);
  expect(r.winnerId).toBe(shootout.home > shootout.away ? r.homeId : r.awayId);
  expect(r.events[r.events.length - 1].type).toBe('shootoutEnd');
  expect(eventsOf(r, 'shootoutEnd')[0].teamId).toBe(r.winnerId);

  for (const side of SIDES) {
    const kicks = r.events.filter((e) => e.type === 'shootoutKick' && e.side === side);
    const final = sideOf(played.state, side);
    const eligible = final.onPitch.filter((id) => id !== '');
    for (const kick of kicks) {
      expect(eligible).toContain(kick.playerId);
      expect(final.sentOff).not.toContain(kick.playerId);
      expect(kick.minute).toBe(121);
    }
    // Nobody kicks a second time until every eligible team-mate has kicked once.
    const counts = new Map<string, number>();
    kicks.forEach((kick, index) => {
      const n = counts.get(kick.playerId!) ?? 0;
      if (n > 0) expect(index).toBeGreaterThanOrEqual(eligible.length * n);
      counts.set(kick.playerId!, n + 1);
    });
    const kicksTaken = kicks.length;
    expect(kicksTaken).toBeGreaterThanOrEqual(3);
  }
  const homeKicks = r.events.filter((e) => e.type === 'shootoutKick' && e.side === 'home').length;
  const awayKicks = r.events.filter((e) => e.type === 'shootoutKick' && e.side === 'away').length;
  expect(Math.abs(homeKicks - awayKicks)).toBeLessThanOrEqual(1);
  if (homeKicks > 5 || awayKicks > 5) expect(homeKicks).toBe(awayKicks);
  expect(shootout.home).toBeLessThanOrEqual(homeKicks);
  expect(shootout.away).toBeLessThanOrEqual(awayKicks);
}

// ---------------------------------------------------------------------------
// Tactics and fatigue
// ---------------------------------------------------------------------------

describe('tactics change the numbers', () => {
  it('a tactic change takes effect at the very next tick', () => {
    const setup = tacticSetup(17, { pressing: 3, tempo: 3 });
    const base = runUntil(createMatch(setup, ctx), (s) => s.minute >= 30);
    const busy = JSON.parse(JSON.stringify(base)) as MatchState;
    const calm = JSON.parse(JSON.stringify(base)) as MatchState;
    applyAction(busy, ctx, { type: 'setTactics', side: 'home', tactics: { ...busy.home.tactics, pressing: 5, tempo: 5 } });
    applyAction(calm, ctx, { type: 'setTactics', side: 'home', tactics: { ...calm.home.tactics, pressing: 1, tempo: 1 } });
    expect(busy.events[busy.events.length - 1].type).toBe('tacticChange');
    stepMinute(busy, ctx);
    stepMinute(calm, ctx);
    const healthy = base.home.onPitch.filter((id) => id !== '' && !busy.injuries.some((i) => i.playerId === id) && !calm.injuries.some((i) => i.playerId === id));
    for (const id of healthy) {
      const busyDrop = base.home.fatigue[id] - busy.home.fatigue[id];
      const calmDrop = base.home.fatigue[id] - calm.home.fatigue[id];
      expect(busyDrop).toBeGreaterThan(calmDrop);
    }
  });

  it('a formation change re-shapes the same players with the keeper in goal', () => {
    const state = runUntil(createMatch(tacticSetup(4, {}), ctx), (s) => s.minute >= 20);
    const before = state.home.onPitch.slice().sort();
    const target = state.home.tactics.formationId === '5-3-2' ? '4-4-2' : '5-3-2';
    applyAction(state, ctx, { type: 'setTactics', side: 'home', tactics: { ...state.home.tactics, formationId: target } });
    expect(state.home.tactics.formationId).toBe(target);
    expect(state.home.onPitch.slice().sort()).toEqual(before);
    expect(ctx.players[state.home.onPitch[0]].position).toBe('GK');
  });

  it('tired players have lower effective attributes and make a weaker side', () => {
    const state = createMatch(tacticSetup(51, {}), ctx);
    const striker = state.home.onPitch.find((id) => ctx.players[id].position === 'ST')!;
    const player = ctx.players[striker];
    expect(effective(player, 0.5, 'fin')).toBeLessThan(effective(player, 1, 'fin'));
    expect(weightedAttributes(player, 0.4, { fin: 1, pac: 1 })).toBeLessThan(weightedAttributes(player, 0.9, { fin: 1, pac: 1 }));
    const shape = formation(state.home.tactics.formationId);
    const fresh = sideStrength(state.home, shape, ctx);
    const tired = JSON.parse(JSON.stringify(state.home)) as SideState;
    for (const id of Object.keys(tired.fatigue)) tired.fatigue[id] = 0.4;
    const weary = sideStrength(tired, shape, ctx);
    expect(weary.attack).toBeLessThan(fresh.attack);
    expect(weary.midfield).toBeLessThan(fresh.midfield);
    expect(weary.defense).toBeLessThan(fresh.defense);
    expect(weary.goalkeeper).toBeLessThan(fresh.goalkeeper);
  });

  it('a defensive formation concedes fewer shots than an attacking one', () => {
    const conceded = (formationId: string) => averageOver(150, 9800, (seed) => tacticSetup(seed, { formationId }), (p) => p.result.stats.away.shots);
    expect(conceded('5-3-2')).toBeLessThan(conceded('3-4-3'));
  });

  it('fatigue: pressing 5 + tempo 5 leaves less energy at 90 than 2/2', () => {
    const energyAt90 = (tactics: Partial<Tactics>) =>
      mean(seeds(60, 300).map((seed) => averageEnergyOnPitch(runUntil(createMatch(tacticSetup(seed, tactics), ctx), () => false).home)));
    const hard = energyAt90({ pressing: 5, tempo: 5 });
    const easy = energyAt90({ pressing: 2, tempo: 2 });
    expect(hard).toBeLessThan(easy - 0.1);
    expect(easy).toBeLessThan(1);
    expect(hard).toBeGreaterThan(0.1);
  });

  it('energy only ever goes down during a match', () => {
    const state = createMatch(tacticSetup(41, {}), ctx);
    let previous = { ...state.home.fatigue };
    while (!isFinished(state)) {
      stepMinute(state, ctx);
      for (const [id, energy] of Object.entries(previous)) expect(state.home.fatigue[id]).toBeLessThanOrEqual(energy);
      previous = { ...state.home.fatigue };
    }
  });

  it('pressing 5 drains more energy than pressing 1 (300 matches each)', () => {
    const energyAtEnd = (pressing: 1 | 5) =>
      mean(seeds(300, 1000).map((seed) => averageEnergyOnPitch(play(tacticSetup(seed, { pressing })).state.home)));
    expect(energyAtEnd(5)).toBeLessThan(energyAtEnd(1));
  });

  it('mentality 5 creates more shots than mentality 1 (300 matches each)', () => {
    const shots = (mentality: 1 | 5) => averageOver(300, 2000, (seed) => tacticSetup(seed, { mentality }), (p) => p.result.stats.home.shots);
    expect(shots(5)).toBeGreaterThan(shots(1) * 1.2);
  });

  it('tempo 5 + directness 5 gives up possession compared with tempo 2 + directness 1', () => {
    const possession = (tempo: 2 | 5, directness: 1 | 5) =>
      averageOver(150, 3000, (seed) => tacticSetup(seed, { tempo, directness }), (p) => p.result.stats.home.possession);
    expect(possession(5, 5)).toBeLessThan(possession(2, 1) - 0.05);
  });

  it('counter-attacking produces more counter chances and more xG (300 matches each)', () => {
    const runs = (counterAttack: boolean) => seeds(300, 4000).map((seed) => play(tacticSetup(seed, { counterAttack })));
    const on = runs(true);
    const off = runs(false);
    const counters = (ps: Played[]) => mean(ps.map((p) => p.state.home.chances.counter));
    const xg = (ps: Played[]) => mean(ps.map((p) => p.result.stats.home.xg));
    expect(counters(on)).toBeGreaterThan(counters(off) * 1.3);
    expect(xg(on)).toBeGreaterThan(xg(off));
    // Chance kinds add up to the shot count.
    for (const p of on) {
      const c = p.state.home.chances;
      expect(c.openPlay + c.counter + c.setPiece + c.penalty).toBe(p.result.stats.home.shots);
    }
  });

  it('a man-marked star shoots, creates and scores less than when unmarked (300 matches each)', () => {
    const betaStarters = makeSetup('alpha', 'beta', 1).away.lineup.starters;
    const star = betaStarters
      .filter((id) => ['ST', 'W', 'AM'].includes(ctx.players[id].position))
      .sort((a, b) => ctx.players[b].overall - ctx.players[a].overall)[0];
    const involvement = (manMarkTarget: string | null) => {
      const runs = seeds(300, 6000).map((seed) => play(tacticSetup(seed, { manMarkTarget })).result.playerStats[star]);
      return {
        touches: mean(runs.map((p) => (p ? p.shots + p.keyPasses : 0))),
        output: mean(runs.map((p) => (p ? p.goals + p.assists : 0))),
      };
    };
    const marked = involvement(star);
    const free = involvement(null);
    expect(marked.touches).toBeLessThan(free.touches * 0.85);
    expect(marked.output).toBeLessThan(free.output);
  });

  it('nominated set-piece takers take the corners, free kicks and penalties', () => {
    const setup = tacticSetup(0, {});
    const takers = setup.home.lineup.starters.filter((id) => ctx.players[id].position !== 'GK').slice(-3);
    const tactics = { setPieceTakers: { corners: takers[0], freeKicks: takers[1], penalties: takers[2] } };
    for (const seed of seeds(40, 7000)) {
      const r = play(tacticSetup(seed, tactics)).result;
      // A sent-off taker hands the job to someone else, so those matches prove nothing here.
      if (takers.some((id) => r.sentOff.includes(id))) continue;
      for (const e of r.events.filter((x) => x.side === 'home')) {
        if (e.type === 'corner') expect(e.playerId).toBe(takers[0]);
        if (e.type === 'freeKick') expect(e.playerId).toBe(takers[1]);
        if (e.type === 'penaltyScored' || e.type === 'penaltySaved' || e.type === 'penaltyMissed') expect(e.playerId).toBe(takers[2]);
      }
    }
  });

  it('time-wasting when ahead late adds stoppage time and kills minutes', () => {
    const lateWasting = (timeWasting: 1 | 5) =>
      averageOver(150, 8000, (seed) => tacticSetup(seed, { timeWasting }), (p) => {
        const fullTime = eventsOf(p.result, 'fullTime')[0];
        return fullTime.added;
      });
    expect(lateWasting(5)).toBeGreaterThan(lateWasting(1));
  });

  it('a high defensive line gets caught offside more often by the opponent and wide play wins more corners', () => {
    const awayOffsides = (defensiveLine: 1 | 5) => averageOver(100, 9000, (seed) => tacticSetup(seed, { defensiveLine }), (p) => p.result.stats.away.offsides);
    expect(awayOffsides(5)).toBeGreaterThan(awayOffsides(1));
    const corners = (width: 1 | 5) => averageOver(100, 9500, (seed) => tacticSetup(seed, { width }), (p) => p.result.stats.home.corners);
    expect(corners(5)).toBeGreaterThan(corners(1));
  });
});
