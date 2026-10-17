/**
 * The real league data through the real squad and staff generators. Whole real
 * seasons and playoffs on the spatial engine, with nothing stubbed, are played by
 * the slow suite (tests/slow, npm run test:slow).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { formation } from '../src/sim/data';
import { createLeague, headCoachOf } from '../src/sim/league';
import type { League } from '../src/sim/types';

const SEED = 'integration-seed';
const TEAM_COUNT = 16;

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
