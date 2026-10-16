import { describe, expect, it } from 'vitest';
import { CLUBS, SEASON_TUNING } from '../src/sim/data';
import { createLeague, headCoachOf, playersOf, teamById } from '../src/sim/league';
import { advanceBracket, createBracket, scheduleFinal, scheduleQuarterFinals, scheduleSemiFinals, seedPlayoffs } from '../src/sim/playoffs';
import { Rng } from '../src/sim/rng';
import { buildSchedule, runLengths } from '../src/sim/schedule';
import {
  advanceWeek,
  applyMatchResult,
  buildMatchSetup,
  createSeason,
  matchesForWeek,
  runSeason,
  seasonSummary,
  type SeasonHooks,
  type SeasonState,
} from '../src/sim/season';
import { computeStandings, emptyRow } from '../src/sim/standings';
import type { MatchSetup, ScheduledMatch, StandingsRow } from '../src/sim/types';
import { FIXTURE_TEAM_COUNT, makeFixtureLeague, resultFor, spearman, stubHooks, stubSimulate, teamIdAt } from './helpers/seasonFixtures';

const IDS = Array.from({ length: FIXTURE_TEAM_COUNT }, (_, i) => teamIdAt(i));
const CAL = SEASON_TUNING.calendar;

function leagueMatches(matches: ScheduledMatch[]): ScheduledMatch[] {
  return matches.filter((m) => m.stage === 'league');
}

function completedSeason(seed: number, hooks: SeasonHooks = stubHooks()): SeasonState {
  return runSeason(createSeason(makeFixtureLeague(seed)), hooks);
}

function played(id: string, week: number, homeId: string, awayId: string, hs: number, as: number): ScheduledMatch {
  return { id, week, round: week, homeId, awayId, stage: 'league', result: resultFor(id, homeId, awayId, hs, as) };
}

function order(rows: StandingsRow[]): string[] {
  return rows.map((r) => r.teamId);
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

describe('buildSchedule', () => {
  const schedule = buildSchedule(new Rng(42), 1, IDS);
  const matches = schedule.matches;

  it('has 240 matches in 30 rounds of 8, with every club once per round', () => {
    expect(matches).toHaveLength(240);
    for (let round = 1; round <= 30; round++) {
      const inRound = matches.filter((m) => m.round === round);
      expect(inRound).toHaveLength(8);
      const teams = inRound.flatMap((m) => [m.homeId, m.awayId]);
      expect(new Set(teams).size).toBe(16);
    }
  });

  it('pairs every club twice, once at each ground', () => {
    for (const a of IDS) {
      for (const b of IDS) {
        if (a === b) continue;
        expect(matches.filter((m) => m.homeId === a && m.awayId === b)).toHaveLength(1);
      }
    }
  });

  it('gives each club 15 home and 15 away matches and no venue run longer than 3', () => {
    for (const id of IDS) {
      const own = matches.filter((m) => m.homeId === id || m.awayId === id).sort((x, y) => x.round - y.round);
      expect(own.filter((m) => m.homeId === id)).toHaveLength(15);
      expect(own.filter((m) => m.awayId === id)).toHaveLength(15);
      const pattern = own.map((m) => m.homeId === id);
      expect(Math.max(...runLengths(pattern))).toBeLessThanOrEqual(SEASON_TUNING.scheduleSearch.maxVenueStreak);
    }
  });

  it('keeps venue runs short for many seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = buildSchedule(new Rng(seed), 1, IDS);
      for (const id of IDS) {
        const pattern = s.matches
          .filter((m) => m.homeId === id || m.awayId === id)
          .sort((x, y) => x.round - y.round)
          .map((m) => m.homeId === id);
        expect(Math.max(...runLengths(pattern))).toBeLessThanOrEqual(3);
      }
    }
  });

  it('plays rounds 1-15 in weeks 1-15 and rounds 16-30 in weeks 18-32 around a two-week break', () => {
    expect(schedule.breakWeeks).toEqual([16, 17]);
    expect(schedule.weeks).toBe(35);
    for (const m of matches) {
      expect(m.week).toBe(m.round <= 15 ? m.round : m.round + 2);
      expect(m.stage).toBe('league');
      expect(m.result).toBeUndefined();
    }
    expect(matches.some((m) => schedule.breakWeeks.includes(m.week))).toBe(false);
  });

  it('builds readable, unique match ids', () => {
    expect(new Set(matches.map((m) => m.id)).size).toBe(240);
    for (const m of matches) expect(m.id).toBe(`s1-r${String(m.round).padStart(2, '0')}-${m.homeId}-v-${m.awayId}`);
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(buildSchedule(new Rng(42), 1, IDS)).toEqual(schedule);
    const firstRound = (s: typeof schedule) =>
      s.matches.filter((m) => m.round === 1).map((m) => `${m.homeId}-${m.awayId}`).sort();
    expect(firstRound(buildSchedule(new Rng(43), 1, IDS))).not.toEqual(firstRound(schedule));
  });

  it('rejects a team count that does not fit the calendar', () => {
    expect(() => buildSchedule(new Rng(1), 1, IDS.slice(0, 14))).toThrow();
    expect(() => buildSchedule(new Rng(1), 1, IDS.slice(0, 15))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

describe('computeStandings', () => {
  it('awards 3/1/0 points and counts goals', () => {
    const rows = computeStandings(['a', 'b', 'c'], [played('m1', 1, 'a', 'b', 2, 0), played('m2', 2, 'b', 'c', 1, 1)], new Rng(1));
    const a = rows.find((r) => r.teamId === 'a') as StandingsRow;
    const b = rows.find((r) => r.teamId === 'b') as StandingsRow;
    expect(a).toMatchObject({ played: 1, won: 1, points: 3, goalsFor: 2, goalsAgainst: 0, goalDifference: 2 });
    expect(b).toMatchObject({ played: 2, won: 0, drawn: 1, lost: 1, points: 1, goalsFor: 1, goalsAgainst: 3, goalDifference: -2 });
    expect(order(rows)[0]).toBe('a');
  });

  it('ranks on points first', () => {
    // b has the better goal difference but fewer points.
    const matches = [played('m1', 1, 'a', 'c', 1, 0), played('m2', 1, 'b', 'd', 5, 0), played('m3', 2, 'a', 'd', 1, 0), played('m4', 2, 'b', 'c', 0, 1)];
    expect(order(computeStandings(['a', 'b', 'c', 'd'], matches, new Rng(1))).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('breaks a points tie on goal difference', () => {
    const matches = [played('m1', 1, 'a', 'c', 3, 0), played('m2', 1, 'd', 'b', 0, 1)];
    for (let seed = 1; seed <= 10; seed++) expect(order(computeStandings(['b', 'a', 'c', 'd'], matches, new Rng(seed))).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('breaks a points and goal-difference tie on goals for', () => {
    const matches = [played('m1', 1, 'a', 'c', 3, 1), played('m2', 1, 'b', 'd', 2, 0)];
    for (let seed = 1; seed <= 10; seed++) expect(order(computeStandings(['b', 'a', 'c', 'd'], matches, new Rng(seed))).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('breaks a full tie on head-to-head points', () => {
    // a and b both finish on 3 points, GD 0, GF 2; a won their meeting.
    const matches = [played('m1', 1, 'b', 'a', 0, 1), played('m2', 2, 'a', 'd', 1, 2), played('m3', 2, 'b', 'c', 2, 1)];
    for (let seed = 1; seed <= 20; seed++) {
      const rows = computeStandings(['b', 'a', 'c', 'd'], matches, new Rng(seed));
      const a = rows.find((r) => r.teamId === 'a') as StandingsRow;
      const b = rows.find((r) => r.teamId === 'b') as StandingsRow;
      expect([a.points, a.goalDifference, a.goalsFor]).toEqual([b.points, b.goalDifference, b.goalsFor]);
      expect(order(rows)).toEqual(['d', 'a', 'b', 'c']);
    }
  });

  it('falls back to a seeded coin flip when nothing separates two clubs', () => {
    const matches = [played('m1', 1, 'a', 'b', 1, 1)];
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const first = order(computeStandings(['a', 'b'], matches, new Rng(seed)));
      const again = order(computeStandings(['a', 'b'], matches, new Rng(seed)));
      expect(again).toEqual(first);
      orders.add(first.join(','));
    }
    expect(orders).toEqual(new Set(['a,b', 'b,a']));
  });

  it('keeps form to the last five results, oldest first', () => {
    const scores: [number, number][] = [[1, 0], [0, 1], [2, 2], [3, 0], [0, 2], [1, 1], [4, 1]];
    const matches = scores.map(([h, a], i) => played(`m${i}`, i + 1, 'a', 'b', h, a));
    const shuffled = new Rng(9).shuffle(matches);
    const rows = computeStandings(['a', 'b'], shuffled, new Rng(1));
    const a = rows.find((r) => r.teamId === 'a') as StandingsRow;
    const b = rows.find((r) => r.teamId === 'b') as StandingsRow;
    expect(a.form).toEqual(['D', 'W', 'L', 'D', 'W']);
    expect(b.form).toEqual(['D', 'L', 'W', 'D', 'L']);
  });

  it('ignores unplayed and playoff matches', () => {
    const unplayed: ScheduledMatch = { id: 'u', week: 2, round: 2, homeId: 'a', awayId: 'b', stage: 'league' };
    const playoff: ScheduledMatch = { ...played('p', 33, 'b', 'a', 5, 0), stage: 'final', round: 0 };
    const rows = computeStandings(['a', 'b'], [unplayed, playoff], new Rng(1));
    expect(rows.map((r) => r.played)).toEqual([0, 0]);
    expect(rows.every((r) => JSON.stringify({ ...r, teamId: '' }) === JSON.stringify({ ...emptyRow(''), form: [] }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Playoffs
// ---------------------------------------------------------------------------

describe('playoffs', () => {
  const seeds = ['s1', 's2', 's3', 's4', 's5', 's6'];
  const rows = [...seeds, 's7', 's8'].map((id) => emptyRow(id));

  function win(match: ScheduledMatch, winnerId: string): void {
    const homeWins = winnerId === match.homeId;
    match.result = resultFor(match.id, match.homeId, match.awayId, homeWins ? 1 : 0, homeWins ? 0 : 1);
  }

  it('seeds the top six in table order', () => {
    expect(seedPlayoffs(rows)).toEqual(seeds);
  });

  it('plays 3 v 6 and 4 v 5, then seed 1 meets the lowest seed left, with the higher seed at home', () => {
    const bracket = createBracket(seeds);
    const qfs = scheduleQuarterFinals(bracket, 1, 33);
    expect(qfs.map((m) => [m.homeId, m.awayId])).toEqual([['s3', 's6'], ['s4', 's5']]);
    expect(scheduleSemiFinals(bracket, 1, 34)).toEqual([]);
    win(qfs[0], 's3');
    win(qfs[1], 's5'); // lower seed upsets: s5 is now the lowest remaining
    const sfs = scheduleSemiFinals(bracket, 1, 34);
    expect(sfs.map((m) => [m.homeId, m.awayId])).toEqual([['s1', 's5'], ['s2', 's3']]);
    expect(scheduleFinal(bracket, 1, 35)).toBeNull();
    win(sfs[0], 's5');
    win(sfs[1], 's3');
    const final = scheduleFinal(bracket, 1, 35) as ScheduledMatch;
    expect([final.homeId, final.awayId, final.stage, final.week]).toEqual(['s3', 's5', 'final', 35]);
    advanceBracket(bracket);
    expect(bracket.championId).toBeNull();
    win(final, 's5');
    advanceBracket(bracket);
    expect(bracket.championId).toBe('s5');
  });

  it('does not schedule a round twice', () => {
    const bracket = createBracket(seeds);
    const qfs = scheduleQuarterFinals(bracket, 1, 33);
    expect(scheduleQuarterFinals(bracket, 1, 33)).toBe(qfs);
  });
});

// ---------------------------------------------------------------------------
// Full season
// ---------------------------------------------------------------------------

describe('runSeason', () => {
  const setups: MatchSetup[] = [];
  const hooks = stubHooks({
    simulate: (setup, ctx) => {
      setups.push(setup);
      return stubSimulate(setup, ctx);
    },
  });
  const state = completedSeason(7, hooks);
  const bracket = state.bracket;
  const playoffs = state.schedule.matches.filter((m) => m.stage !== 'league');

  it('completes with every match played', () => {
    expect(state.phase).toBe('complete');
    expect(state.week).toBe(36);
    expect(state.schedule.matches).toHaveLength(245);
    expect(state.schedule.matches.filter((m) => m.result)).toHaveLength(245);
    expect(setups).toHaveLength(245);
  });

  it('gives the shield to the table leader and seeds the top six', () => {
    expect(state.standings.every((r) => r.played === 30)).toBe(true);
    expect(state.shieldWinnerId).toBe(state.standings[0].teamId);
    expect(bracket?.seeds).toEqual(state.standings.slice(0, 6).map((r) => r.teamId));
  });

  it('runs the playoffs to the rules', () => {
    if (!bracket) throw new Error('no bracket');
    const seedOf = (id: string) => bracket.seeds.indexOf(id);
    expect(bracket.quarterFinals.every((m) => m.week === 33)).toBe(true);
    expect(bracket.semiFinals.every((m) => m.week === 34)).toBe(true);
    expect(bracket.final?.week).toBe(35);
    for (const m of bracket.quarterFinals) {
      expect([seedOf(m.homeId), seedOf(m.awayId)].some((s) => s < 2)).toBe(false);
    }
    expect(bracket.semiFinals.map((m) => m.homeId)).toEqual(bracket.seeds.slice(0, 2));
    expect(playoffs).toHaveLength(5);
    for (const m of playoffs) {
      expect(seedOf(m.homeId)).toBeLessThan(seedOf(m.awayId));
      expect(m.round).toBe(0);
      expect(m.result?.winnerId).toBeTruthy();
      expect([m.homeId, m.awayId]).toContain(m.result?.winnerId);
    }
    expect(state.championId).toBe(bracket.final?.result?.winnerId);
    expect(bracket.seeds).toContain(state.championId);
  });

  it('flags playoff setups and leaves league setups regular', () => {
    const playoffIds = new Set(playoffs.map((m) => m.id));
    for (const s of setups) {
      expect(s.playoff).toBe(playoffIds.has(s.matchId));
      expect(s.aiControlled).toEqual({ home: true, away: true });
      expect(s.attendanceShare).toBeGreaterThanOrEqual(SEASON_TUNING.attendance.min);
      expect(s.attendanceShare).toBeLessThanOrEqual(SEASON_TUNING.attendance.max);
    }
    for (const s of setups.filter((x) => !x.playoff)) expect(s.weather).not.toBe('snow');
  });

  it('summarises believable numbers from the stored results', () => {
    const summary = seasonSummary(state);
    expect(summary.champion).toBe(state.championId);
    expect(summary.shield).toBe(state.shieldWinnerId);
    expect(summary.avgGoals).toBeGreaterThan(1.8);
    expect(summary.avgGoals).toBeLessThan(3.8);
    expect(summary.homeWinRate).toBeGreaterThan(0.3);
    expect(summary.homeWinRate).toBeLessThan(0.65);
    expect(summary.drawRate).toBeGreaterThan(0.1);
    expect(summary.drawRate).toBeLessThan(0.4);
    expect(summary.topScorers.length).toBeGreaterThan(0);
    expect(summary.topScorers.length).toBeLessThanOrEqual(SEASON_TUNING.summaryTopScorers);
    for (let i = 1; i < summary.topScorers.length; i++) {
      expect(summary.topScorers[i - 1].goals).toBeGreaterThanOrEqual(summary.topScorers[i].goals);
    }
    const leagueGoals = leagueMatches(state.schedule.matches).reduce((n, m) => n + (m.result?.homeScore ?? 0) + (m.result?.awayScore ?? 0), 0);
    expect(summary.avgGoals * 240).toBeCloseTo(leagueGoals, 6);
    const tableGoals = state.standings.reduce((n, r) => n + r.goalsFor, 0);
    expect(tableGoals).toBe(leagueGoals);
  });

  it('moves through the phases week by week', () => {
    const s = createSeason(makeFixtureLeague(3));
    const seen: string[] = [];
    while (s.phase !== 'complete') {
      seen.push(`${s.week}:${s.phase}`);
      const results = advanceWeek(s, stubHooks());
      if (CAL.breakWeeks.includes(s.week - 1)) expect(results).toHaveLength(0);
    }
    expect(seen[0]).toBe('1:regular');
    expect(seen).toContain('16:break');
    expect(seen).toContain('17:break');
    expect(seen).toContain('18:regular');
    expect(seen).toContain('33:playoffs');
    expect(seen[seen.length - 1]).toBe('35:playoffs');
    expect(advanceWeek(s, stubHooks())).toEqual([]);
    expect(s.week).toBe(36);
  });

  it('finishes quickly with the stub simulator', () => {
    const t0 = performance.now();
    completedSeason(11);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('determinism', () => {
  const snapshot = (s: SeasonState) => ({
    standings: s.standings,
    results: s.schedule.matches.map((m) => m.result),
    championId: s.championId,
  });

  it('replays a season exactly from the same seed', () => {
    expect(snapshot(completedSeason(21))).toEqual(snapshot(completedSeason(21)));
  });

  it('gives a different season from a different seed', () => {
    expect(snapshot(completedSeason(22))).not.toEqual(snapshot(completedSeason(21)));
  });

  it('derives the same setup for a match regardless of when it is built', () => {
    const a = createSeason(makeFixtureLeague(5));
    const b = createSeason(makeFixtureLeague(5));
    const match = matchesForWeek(a, 1)[0];
    expect(buildMatchSetup(a, match, stubHooks())).toEqual(buildMatchSetup(b, matchesForWeek(b, 1)[0], stubHooks()));
  });
});

// ---------------------------------------------------------------------------
// Player upkeep
// ---------------------------------------------------------------------------

describe('injuries, suspensions and condition', () => {
  /** A stub that forces events on one player in week 1 and keeps him clean afterwards. */
  function scriptedHooks(playerId: string, week1: { sentOff?: boolean; injuryWeeks?: number; booked?: boolean }): SeasonHooks {
    let call = 0;
    return stubHooks({
      simulate: (setup, ctx) => {
        const r = stubSimulate(setup, ctx);
        r.sentOff = r.sentOff.filter((id) => id !== playerId);
        r.booked = r.booked.filter((id) => id !== playerId);
        r.injuries = r.injuries.filter((i) => i.playerId !== playerId);
        const involved = setup.home.lineup.starters.includes(playerId) || setup.away.lineup.starters.includes(playerId);
        if (involved && call++ === 0) {
          if (week1.sentOff) r.sentOff.push(playerId);
          if (week1.booked) r.booked.push(playerId);
          if (week1.injuryWeeks) r.injuries.push({ playerId, weeks: week1.injuryWeeks });
        }
        return r;
      },
    });
  }

  it('suspends a sent-off player for his team\'s next match only', () => {
    const state = createSeason(makeFixtureLeague(1));
    const playerId = teamById(state.league, 't01').selection.lineup.starters[4];
    const hooks = scriptedHooks(playerId, { sentOff: true });
    advanceWeek(state, hooks);
    expect(state.league.players[playerId].suspensionMatches).toBe(1);
    advanceWeek(state, hooks);
    expect(state.league.players[playerId].suspensionMatches).toBe(0);
  });

  it('keeps a ban through the break, when nobody plays', () => {
    const state = createSeason(makeFixtureLeague(1));
    const player = state.league.players['t02-p03'];
    while (state.week < 16) advanceWeek(state, scriptedHooks(player.id, {}));
    player.suspensionMatches = 1;
    advanceWeek(state, stubHooks());
    advanceWeek(state, stubHooks());
    expect(player.suspensionMatches).toBe(1);
  });

  it('adds a suspension on every fifth yellow of the season', () => {
    const state = createSeason(makeFixtureLeague(1));
    const match = matchesForWeek(state, 1)[0];
    const player = state.league.players[teamById(state.league, match.homeId).playerIds[3]];
    player.seasonYellows = 3;
    applyMatchResult(state, match, resultFor(match.id, match.homeId, match.awayId, 0, 0, { booked: [player.id] }));
    expect([player.seasonYellows, player.suspensionMatches]).toEqual([4, 0]);
    applyMatchResult(state, match, resultFor(match.id, match.homeId, match.awayId, 0, 0, { booked: [player.id] }));
    expect([player.seasonYellows, player.suspensionMatches]).toEqual([5, SEASON_TUNING.discipline.yellowSuspensionMatches]);
    player.seasonYellows = 9;
    applyMatchResult(state, match, resultFor(match.id, match.homeId, match.awayId, 0, 0, { booked: [player.id] }));
    expect(player.suspensionMatches).toBe(2 * SEASON_TUNING.discipline.yellowSuspensionMatches);
  });

  it('resets yellow tallies when a new season starts', () => {
    const league = makeFixtureLeague(1);
    league.players['t01-p02'].seasonYellows = 4;
    createSeason(league);
    expect(league.players['t01-p02'].seasonYellows).toBe(0);
  });

  it('keeps the longer injury and counts it down one week at a time', () => {
    const state = createSeason(makeFixtureLeague(1));
    const playerId = teamById(state.league, 't05').selection.lineup.starters[2];
    const hooks = scriptedHooks(playerId, { injuryWeeks: 3 });
    advanceWeek(state, hooks);
    const p = state.league.players[playerId];
    expect(p.injuryWeeks).toBe(3); // picked up this week: the countdown starts next week
    const match = matchesForWeek(state, 2).find((m) => m.homeId === 't05' || m.awayId === 't05') as ScheduledMatch;
    applyMatchResult(state, { ...match }, resultFor(match.id, match.homeId, match.awayId, 0, 0, { injuries: [{ playerId, weeks: 1 }] }));
    expect(p.injuryWeeks).toBe(3);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      advanceWeek(state, hooks);
      seen.push(p.injuryWeeks);
    }
    expect(seen).toEqual([2, 1, 0, 0]);
  });

  it('drains condition with minutes, keeps it in 0-1 and recovers it over the break', () => {
    const state = createSeason(makeFixtureLeague(4));
    const all = () => Object.values(state.league.players);
    const starter = state.league.players[teamById(state.league, 't09').selection.lineup.starters[1]];
    const benchPlayer = state.league.players[teamById(state.league, 't09').selection.lineup.bench[1]];
    const match = matchesForWeek(state, 1).find((m) => m.homeId === 't09' || m.awayId === 't09') as ScheduledMatch;
    const result = stubSimulate(buildMatchSetup(state, match, stubHooks()), { players: state.league.players, teams: Object.fromEntries(state.league.teams.map((t) => [t.id, t])) });
    applyMatchResult(state, match, result);
    expect(starter.condition).toBeCloseTo(1 - SEASON_TUNING.condition.lossPer90 * (result.extraTime ? 120 / 90 : 1), 6);
    expect(benchPlayer.condition).toBe(1);
    expect(starter.form).toEqual([result.playerStats[starter.id].rating]);

    while (state.week < 16) {
      advanceWeek(state, stubHooks());
      for (const p of all()) {
        expect(p.condition).toBeGreaterThanOrEqual(0);
        expect(p.condition).toBeLessThanOrEqual(1);
        expect(p.form.length).toBeLessThanOrEqual(SEASON_TUNING.formLength);
      }
    }
    const before = new Map(all().map((p) => [p.id, p.condition]));
    advanceWeek(state, stubHooks());
    advanceWeek(state, stubHooks());
    let improved = 0;
    for (const p of all()) {
      const was = before.get(p.id) as number;
      expect(p.condition).toBeGreaterThanOrEqual(was);
      if (p.condition > was) improved += 1;
    }
    expect(improved).toBeGreaterThan(100);
    expect(starter.form).toHaveLength(SEASON_TUNING.formLength);
  });
});

// ---------------------------------------------------------------------------
// Strength predicts the table
// ---------------------------------------------------------------------------

describe('strength', () => {
  it('stronger squads finish with more points', () => {
    const correlations = [101, 102, 103, 104, 105].map((seed) => {
      const state = completedSeason(seed);
      const quality = state.standings.map((r) => teamById(state.league, r.teamId).squadQuality);
      return spearman(quality, state.standings.map((r) => r.points));
    });
    const mean = correlations.reduce((a, b) => a + b, 0) / correlations.length;
    expect(mean).toBeGreaterThan(0.5);
    for (const c of correlations) expect(c).toBeGreaterThan(0.2);
  });
});

// ---------------------------------------------------------------------------
// League helpers and creation
// ---------------------------------------------------------------------------

describe('league', () => {
  it('looks up teams, squads and head coaches', () => {
    const league = makeFixtureLeague(1);
    expect(teamById(league, 't03').id).toBe('t03');
    expect(() => teamById(league, 'nope')).toThrow(/Unknown team/);
    const squad = playersOf(league, 't03');
    expect(squad).toHaveLength(18);
    expect(squad.every((p) => p.teamId === 't03')).toBe(true);
    expect(headCoachOf(league, 't03')?.role).toBe('headCoach');
    league.teams[2].staffIds = [];
    expect(headCoachOf(league, 't03')).toBeNull();
  });

  it('passes the homegrown minimum to the selector only when the rule is on', () => {
    const minimums: (number | undefined)[] = [];
    const hooks = stubHooks({
      select: (_rng, team, _players, _coach, opts) => {
        minimums.push(opts.homegrownMinimum);
        expect(opts.opponent.id).not.toBe(team.id);
        return team.selection;
      },
    });
    const off = createSeason(makeFixtureLeague(1), undefined, { homegrownRule: false });
    buildMatchSetup(off, matchesForWeek(off, 1)[0], hooks);
    const on = createSeason(makeFixtureLeague(1), undefined, { homegrownRule: true });
    buildMatchSetup(on, matchesForWeek(on, 1)[0], hooks);
    expect(minimums).toEqual([undefined, undefined, SEASON_TUNING.homegrownMinimum, SEASON_TUNING.homegrownMinimum]);
  });

  it.runIf(CLUBS.length === 0)('refuses to build a league while clubs.json is empty', () => {
    expect(() => createLeague(1)).toThrow('clubs.json is empty');
  });

  it.runIf(CLUBS.length > 0)('builds every club from clubs.json with squads, staff and a selection', () => {
    const league = createLeague('valmere', { season: 2 });
    expect(league.season).toBe(2);
    expect(league.teams).toHaveLength(CLUBS.length);
    expect(league.freeAgentIds).toHaveLength(SEASON_TUNING.freeAgentPoolSize);
    for (const team of league.teams) {
      expect(team.playerIds.length).toBeGreaterThan(0);
      expect(headCoachOf(league, team.id)).not.toBeNull();
      expect(team.selection.lineup.starters).toHaveLength(11);
      for (const id of team.selection.lineup.starters) expect(team.playerIds).toContain(id);
    }
    expect(createLeague('valmere', { season: 2 })).toEqual(league);
  });
});
