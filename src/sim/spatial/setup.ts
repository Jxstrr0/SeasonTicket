/**
 * Build a spatial match setup from league data: each side's eleven starters in formation
 * slot order and its bench, with the attributes, positions and fitness the engine reads.
 */
import type { League, Player, Team, Weather } from '../types';
import type { SpatialPlayer, SpatialSetup, SpatialSide } from './types';

function toSpatial(p: Player): SpatialPlayer {
  return {
    id: p.id,
    name: p.lastName,
    jersey: p.jersey,
    position: p.position,
    secondary: [...p.secondaryPositions],
    attributes: { ...p.attributes },
  };
}

function sideFromTeam(league: League, team: Team): SpatialSide {
  const lineup = team.selection.lineup;
  if (lineup.starters.length !== 11) throw new Error(`${team.shortName} has ${lineup.starters.length} starters, needs 11`);
  const look = (id: string): Player => {
    const p = league.players[id];
    if (!p) throw new Error(`Unknown player ${id}`);
    return p;
  };
  const starters = lineup.starters.map(look);
  const bench = lineup.bench.map(look);
  const t = team.selection.tactics;
  return {
    name: team.name,
    short: team.shortName,
    colors: { ...team.colors },
    tactics: { ...t, setPieceTakers: { ...t.setPieceTakers } },
    players: starters.map(toSpatial),
    bench: bench.map(toSpatial),
    // The engine floors this at the minimum starting energy.
    energy: [...starters, ...bench].map((p) => p.condition),
  };
}

export interface SpatialSetupOptions {
  /** A playoff tie: extra time and penalties if level. */
  extraTime?: boolean;
  weather?: Weather;
}

export function spatialSetupFromLeague(league: League, homeId: string, awayId: string, opts: SpatialSetupOptions = {}): SpatialSetup {
  const home = league.teams.find((t) => t.id === homeId);
  const away = league.teams.find((t) => t.id === awayId);
  if (!home || !away) throw new Error('Unknown team');
  const setup: SpatialSetup = { home: sideFromTeam(league, home), away: sideFromTeam(league, away) };
  if (opts.extraTime) setup.extraTime = true;
  if (opts.weather) setup.weather = opts.weather;
  return setup;
}
