/**
 * Build a spatial match setup from league data: each side's eleven starters in formation
 * slot order and its bench, with the attributes, positions and fitness the engine reads.
 */
import type { League, MatchSetup, Player, Team, TeamSelection, Weather } from '../types';
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

function sideFrom(players: Record<string, Player>, team: Team, selection: TeamSelection): SpatialSide {
  const lineup = selection.lineup;
  if (lineup.starters.length !== 11) throw new Error(`${team.shortName} has ${lineup.starters.length} starters, needs 11`);
  const look = (id: string): Player => {
    const p = players[id];
    if (!p) throw new Error(`Unknown player ${id}`);
    return p;
  };
  const starters = lineup.starters.map(look);
  const bench = lineup.bench.map(look);
  const t = selection.tactics;
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
  const setup: SpatialSetup = { home: sideFrom(league.players, home, home.selection), away: sideFrom(league.players, away, away.selection) };
  if (opts.extraTime) setup.extraTime = true;
  if (opts.weather) setup.weather = opts.weather;
  return setup;
}

/** The spatial setup for a season fixture (the line-ups and tactics it was picked with). */
export function spatialSetupFromMatch(setup: MatchSetup, players: Record<string, Player>, teams: Record<string, Team>): SpatialSetup {
  const home = teams[setup.homeId];
  const away = teams[setup.awayId];
  if (!home || !away) throw new Error('Unknown team');
  const out: SpatialSetup = {
    home: sideFrom(players, home, setup.home), away: sideFrom(players, away, setup.away), weather: setup.weather, crowd: setup.attendanceShare,
  };
  if (setup.playoff) out.extraTime = true;
  return out;
}
