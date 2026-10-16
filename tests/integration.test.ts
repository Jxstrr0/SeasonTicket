/**
 * End-to-end check of Stage 1: the real league data, the real squad and staff
 * generators, the real AI coach and the real match engine, run through a whole
 * season and playoffs. Nothing here is stubbed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { formation } from '../src/sim/data';
import { createLeague, headCoachOf } from '../src/sim/league';
import { createSeason, defaultHooks, runSeason, seasonSummary, type SeasonState } from '../src/sim/season';
import type { League, MatchResult } from '../src/sim/types';
import { spearman } from './helpers/seasonFixtures';

const SEED = 'integration-seed';
const TEAM_COUNT = 16;
const LEAGUE_MATCHES = TEAM_COUNT * (TEAM_COUNT - 1);
// Top-6 playoffs: two quarter-finals (3v6, 4v5), two semi-finals, one final.
const PLAYOFF_MATCHES = 5;
const MAX_SEASON_MS = 15_000;
// Extra league seeds for the believability bands in CLAUDE.md, checked across several seasons.
const BAND_SEEDS = ['bands-1', 'bands-2', 'bands-3', 'bands-4', 'bands-5'];

function playSeason(seed: string): { state: SeasonState; ms: number } {
  const start = performance.now();
  const state = runSeason(createSeason(createLeague(seed)), defaultHooks());
  return { state, ms: performance.now() - start };
}

function resultsOf(state: SeasonState): MatchResult[] {
  return state.schedule.matches.flatMap((m) => (m.result ? [m.result] : []));
}

describe('createLeague with the real data', () => {
  let league: League;
  beforeAll(() => {
    league = createLeague(SEED);
  });

  it('builds 16 teams with squads of 20 to 28', () => {
    expect(league.teams).toHaveLength(TEAM_COUNT);
    for (const team of league.teams) {
      expect(team.playerIds.length).toBeGreaterThanOrEqual(20);
      expect(team.playerIds.length).toBeLessThanOrEqual(28);
    }
  });

  it('links every squad player to the league and back to his team', () => {
    for (const team of league.teams) {
      expect(new Set(team.playerIds).size).toBe(team.playerIds.length);
      for (const id of team.playerIds) {
        const player = league.players[id];
        expect(player, `${team.id}: ${id}`).toBeDefined();
        expect(player?.teamId).toBe(team.id);
      }
    }
  });

  it('gives every team a head coach on its own staff', () => {
    for (const team of league.teams) {
      const coach = headCoachOf(league, team.id);
      expect(coach, team.id).not.toBeNull();
      expect(coach?.teamId).toBe(team.id);
    }
  });

  it('gives every team a valid starting selection', () => {
    for (const team of league.teams) {
      const { starters, bench } = team.selection.lineup;
      const shape = formation(team.selection.tactics.formationId);
      expect(starters, team.id).toHaveLength(11);
      expect(new Set(starters).size).toBe(11);
      expect(shape.slots[0]?.position).toBe('GK');
      expect(league.players[starters[0] ?? '']?.position).toBe('GK');
      expect(bench.length).toBeLessThanOrEqual(9);
      expect(new Set([...starters, ...bench]).size).toBe(starters.length + bench.length);
      for (const id of [...starters, ...bench]) expect(team.playerIds).toContain(id);
    }
  });
});

describe('a full real season and playoffs', () => {
  let first: { state: SeasonState; ms: number };
  beforeAll(() => {
    first = playSeason(SEED);
    const s = seasonSummary(first.state);
    console.log(
      `[integration] season + playoffs in ${first.ms.toFixed(0)} ms; ` +
        `avg goals ${s.avgGoals.toFixed(2)}, home win ${(s.homeWinRate * 100).toFixed(1)}%, draw ${(s.drawRate * 100).toFixed(1)}%`,
    );
  }, 60_000);

  it('completes in under 15 seconds', () => {
    expect(first.state.phase).toBe('complete');
    expect(first.ms).toBeLessThan(MAX_SEASON_MS);
  });

  it('plays 240 league matches and 5 playoff matches', () => {
    const results = resultsOf(first.state);
    expect(results).toHaveLength(LEAGUE_MATCHES + PLAYOFF_MATCHES);
    expect(first.state.schedule.matches.every((m) => m.result !== undefined)).toBe(true);
    expect(first.state.schedule.matches.filter((m) => m.stage === 'league')).toHaveLength(LEAGUE_MATCHES);
  });

  it('averages 2.0 to 3.5 goals per league match', () => {
    const { avgGoals } = seasonSummary(first.state);
    expect(avgGoals).toBeGreaterThanOrEqual(2.0);
    expect(avgGoals).toBeLessThanOrEqual(3.5);
  });

  it('only names players that exist in the league in every event', () => {
    const players = first.state.league.players;
    for (const result of resultsOf(first.state)) {
      for (const event of result.events) {
        if (event.playerId !== null) expect(players[event.playerId], `${result.matchId} ${event.type}`).toBeDefined();
        if (event.secondaryPlayerId !== null) expect(players[event.secondaryPlayerId], `${result.matchId} ${event.type}`).toBeDefined();
      }
    }
  });

  it('crowns a champion from the top six of the table', () => {
    const { championId, standings, bracket } = first.state;
    expect(championId).not.toBeNull();
    expect(bracket?.seeds).toHaveLength(6);
    const topSix = standings.slice(0, 6).map((r) => r.teamId);
    expect(topSix).toContain(championId);
    expect(bracket?.seeds).toContain(championId);
  });

  it('gives identical final standings for the same seed', () => {
    const again = playSeason(SEED);
    expect(again.state.standings).toEqual(first.state.standings);
    expect(again.state.championId).toBe(first.state.championId);
  }, 60_000);
});

describe('believability over several real seasons', () => {
  let seasons: SeasonState[];
  beforeAll(() => {
    seasons = [SEED, ...BAND_SEEDS].map((seed) => playSeason(seed).state);
    const avg = (pick: (s: ReturnType<typeof seasonSummary>) => number) =>
      seasons.reduce((sum, s) => sum + pick(seasonSummary(s)), 0) / seasons.length;
    console.log(
      `[integration] ${seasons.length} seasons: avg goals ${avg((s) => s.avgGoals).toFixed(2)}, ` +
        `home win ${(avg((s) => s.homeWinRate) * 100).toFixed(1)}%, draw ${(avg((s) => s.drawRate) * 100).toFixed(1)}%`,
    );
  }, 120_000);

  const leagueResults = (state: SeasonState): MatchResult[] =>
    state.schedule.matches.flatMap((m) => (m.stage === 'league' && m.result ? [m.result] : []));
  const meanOf = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

  it('averages 2.4 to 3.1 goals per match', () => {
    const avg = meanOf(seasons.map((s) => seasonSummary(s).avgGoals));
    expect(avg).toBeGreaterThanOrEqual(2.4);
    expect(avg).toBeLessThanOrEqual(3.1);
  });

  it('has home wins near 45% and draws near 25%', () => {
    const home = meanOf(seasons.map((s) => seasonSummary(s).homeWinRate));
    const draw = meanOf(seasons.map((s) => seasonSummary(s).drawRate));
    expect(home).toBeGreaterThanOrEqual(0.39);
    expect(home).toBeLessThanOrEqual(0.51);
    expect(draw).toBeGreaterThanOrEqual(0.19);
    expect(draw).toBeLessThanOrEqual(0.31);
  });

  it('gives each team 9 to 16 shots per match on average', () => {
    const results = seasons.flatMap(leagueResults);
    const shots = meanOf(results.flatMap((r) => [r.stats.home.shots, r.stats.away.shots]));
    expect(shots).toBeGreaterThanOrEqual(9);
    expect(shots).toBeLessThanOrEqual(16);
  });

  it('lets stronger squads finish higher', () => {
    for (const state of seasons) {
      const quality = new Map(state.league.teams.map((t) => [t.id, t.squadQuality]));
      const rho = spearman(
        state.standings.map((r) => quality.get(r.teamId) ?? 0),
        state.standings.map((r) => r.points),
      );
      expect(rho).toBeGreaterThan(0.6);
    }
  });
});
