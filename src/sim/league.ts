/**
 * Builds a new league from src/data/clubs.json: every club gets a generated
 * squad, coaching staff and an AI-picked starting selection, and the league
 * gets a pool of free agents.
 */
import { CLUBS, COACH_TUNING, SEASON_TUNING, type ClubSeed } from './data';
import { pickSelection } from './coach';
import { makeIdFactory } from './names';
import { generateSquad } from './players';
import { Rng, hashString } from './rng';
import { generateFreeAgentPool, generateStaff } from './staff';
import type { Dial, League, Player, StaffMember, Team, TeamSelection } from './types';

export interface CreateLeagueOptions {
  season?: number;
  /** Career setting; defaults to season.json. */
  homegrownRule?: boolean;
}

export function createLeague(seed: number | string, opts: CreateLeagueOptions = {}): League {
  if (CLUBS.length === 0) throw new Error('clubs.json is empty');
  const numericSeed = seedNumber(seed);
  const rng = new Rng(numericSeed);
  const ids = makeIdFactory(1);
  const players: Record<string, Player> = {};
  const staff: Record<string, StaffMember> = {};
  const homegrownMinimum = homegrownMinimumFor(opts.homegrownRule ?? SEASON_TUNING.homegrownRule);

  const teams = CLUBS.map((club) => {
    const squad = generateSquad(rng.child(club.id), club.id, club.squadQuality, ids);
    const coaches = generateStaff(rng.child(`${club.id}-staff`), club.id, club.staffQuality, ids);
    for (const p of squad) players[p.id] = p;
    for (const s of coaches) staff[s.id] = s;
    const team = teamFromSeed(club, squad, coaches);
    const headCoach = coaches.find((s) => s.role === 'headCoach') ?? null;
    team.selection = pickSelection(rng.child(`${club.id}-xi`), team, players, headCoach, { homegrownMinimum });
    return team;
  });

  const freeAgents = generateFreeAgentPool(rng.child('free-agents'), SEASON_TUNING.freeAgentPoolSize, ids);
  for (const p of freeAgents) players[p.id] = p;

  return {
    seed: numericSeed,
    season: opts.season ?? 1,
    teams,
    players,
    staff,
    freeAgentIds: freeAgents.map((p) => p.id),
    nextId: ids.current(),
  };
}

/** String seeds hash the same way the Rng does, so new Rng(seed) and new Rng(seedNumber(seed)) match. */
export function seedNumber(seed: number | string): number {
  return typeof seed === 'number' ? seed >>> 0 : hashString(seed);
}

export function homegrownMinimumFor(rule: boolean): number | undefined {
  return rule ? SEASON_TUNING.homegrownMinimum : undefined;
}

/** A balanced placeholder selection with nobody picked yet. */
export function emptySelection(formationId: string): TeamSelection {
  const balanced = COACH_TUNING.tactics.balancedDial as Dial;
  return {
    lineup: { starters: [], bench: [] },
    tactics: {
      formationId,
      mentality: balanced,
      pressing: balanced,
      defensiveLine: balanced,
      width: balanced,
      tempo: balanced,
      directness: balanced,
      counterAttack: false,
      timeWasting: COACH_TUNING.tactics.timeWastingDialDefault as Dial,
      setPieceTakers: { penalties: null, freeKicks: null, corners: null },
      manMarkTarget: null,
    },
  };
}

function teamFromSeed(club: ClubSeed, squad: Player[], coaches: StaffMember[]): Team {
  const headCoach = coaches.find((s) => s.role === 'headCoach');
  return {
    id: club.id,
    name: club.name,
    shortName: club.shortName,
    nickname: club.nickname,
    city: club.city,
    region: club.region,
    abbr: club.abbr,
    colors: { ...club.colors },
    stadiumName: club.stadiumName,
    stadiumCapacity: club.stadiumCapacity,
    marketSize: club.marketSize,
    stadiumCondition: club.stadiumCondition,
    finances: club.finances,
    fanMood: club.fanMood,
    squadQuality: club.squadQuality,
    staffQuality: club.staffQuality,
    playerIds: squad.map((p) => p.id),
    staffIds: coaches.map((s) => s.id),
    // Replaced by the head coach's pick straight after; the formation id only needs to be valid until then.
    selection: emptySelection(headCoach?.preferredFormation ?? ''),
  };
}

export function teamById(league: League, id: string): Team {
  const team = league.teams.find((t) => t.id === id);
  if (!team) throw new Error(`Unknown team ${id}`);
  return team;
}

export function playersOf(league: League, teamId: string): Player[] {
  return teamById(league, teamId).playerIds.map((id) => {
    const player = league.players[id];
    if (!player) throw new Error(`${teamId}: unknown player ${id}`);
    return player;
  });
}

export function headCoachOf(league: League, teamId: string): StaffMember | null {
  const team = teamById(league, teamId);
  for (const id of team.staffIds) {
    const member = league.staff[id];
    if (member && member.role === 'headCoach') return member;
  }
  return null;
}
