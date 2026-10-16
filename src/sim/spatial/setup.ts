/**
 * Build a spatial match setup from league data: each side's eleven starters in formation
 * slot order, with the attributes the engine reads.
 */
import type { League, Team } from '../types';
import type { SpatialPlayer, SpatialSetup, SpatialSide } from './types';

function sideFromTeam(league: League, team: Team): SpatialSide {
  const ids = team.selection.lineup.starters;
  if (ids.length !== 11) throw new Error(`${team.shortName} has ${ids.length} starters, needs 11`);
  const players: SpatialPlayer[] = ids.map((id) => {
    const p = league.players[id];
    if (!p) throw new Error(`Unknown player ${id}`);
    return { id: p.id, name: p.lastName, jersey: p.jersey, position: p.position, attributes: { ...p.attributes } };
  });
  const t = team.selection.tactics;
  return {
    name: team.name,
    short: team.shortName,
    colors: { ...team.colors },
    tactics: { ...t, setPieceTakers: { ...t.setPieceTakers } },
    players,
  };
}

export function spatialSetupFromLeague(league: League, homeId: string, awayId: string): SpatialSetup {
  const home = league.teams.find((t) => t.id === homeId);
  const away = league.teams.find((t) => t.id === awayId);
  if (!home || !away) throw new Error('Unknown team');
  return { home: sideFromTeam(league, home), away: sideFromTeam(league, away) };
}
