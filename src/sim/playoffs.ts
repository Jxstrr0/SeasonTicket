/**
 * Top-six playoffs for the Founders' Cup. Seeds 1 and 2 skip the
 * quarter-finals (3 v 6, 4 v 5); in the semi-finals seed 1 meets the lowest
 * remaining seed and seed 2 the other. The higher seed hosts every match.
 *
 * The bracket is plain data. Its ScheduledMatch objects are the same objects
 * pushed onto schedule.matches, so a result lands in one place.
 */
import { SEASON_TUNING } from './data';
import { matchId } from './schedule';
import type { PlayoffBracket, ScheduledMatch, StandingsRow } from './types';

const P = SEASON_TUNING.playoffs;

export function seedPlayoffs(standings: StandingsRow[]): string[] {
  if (standings.length < P.teams) throw new Error(`seedPlayoffs needs ${P.teams} clubs, got ${standings.length}`);
  return standings.slice(0, P.teams).map((row) => row.teamId);
}

export function createBracket(seeds: string[]): PlayoffBracket {
  if (seeds.length !== P.teams) throw new Error(`createBracket needs ${P.teams} seeds, got ${seeds.length}`);
  return { seeds: seeds.slice(), quarterFinals: [], semiFinals: [], final: null, championId: null };
}

/** 0-based seed index of a club (0 = seed 1). */
export function seedIndex(bracket: PlayoffBracket, teamId: string): number {
  const index = bracket.seeds.indexOf(teamId);
  if (index < 0) throw new Error(`${teamId} is not in the playoff bracket`);
  return index;
}

export function scheduleQuarterFinals(bracket: PlayoffBracket, season: number, week: number): ScheduledMatch[] {
  if (bracket.quarterFinals.length > 0) return bracket.quarterFinals;
  const contenders = bracket.seeds.slice(P.byes);
  const ties: [string, string][] = [];
  for (let i = 0; i < contenders.length / 2; i++) ties.push([contenders[i], contenders[contenders.length - 1 - i]]);
  bracket.quarterFinals = ties.map(([a, b], i) => playoffMatch(bracket, season, week, 'quarterFinal', `qf${i + 1}`, a, b));
  return bracket.quarterFinals;
}

/** Empty until both quarter-finals have results. */
export function scheduleSemiFinals(bracket: PlayoffBracket, season: number, week: number): ScheduledMatch[] {
  if (bracket.semiFinals.length > 0) return bracket.semiFinals;
  const winners = winnersOf(bracket.quarterFinals);
  if (winners === null || bracket.quarterFinals.length === 0) return [];
  const remaining = sortBySeed(bracket, winners);
  const [top, second] = bracket.seeds;
  const lowest = remaining[remaining.length - 1];
  const other = remaining[0];
  bracket.semiFinals = [
    playoffMatch(bracket, season, week, 'semiFinal', 'sf1', top, lowest),
    playoffMatch(bracket, season, week, 'semiFinal', 'sf2', second, other),
  ];
  return bracket.semiFinals;
}

/** Null until both semi-finals have results. */
export function scheduleFinal(bracket: PlayoffBracket, season: number, week: number): ScheduledMatch | null {
  if (bracket.final) return bracket.final;
  const winners = winnersOf(bracket.semiFinals);
  if (winners === null || bracket.semiFinals.length === 0) return null;
  const [a, b] = winners;
  bracket.final = playoffMatch(bracket, season, week, 'final', 'final', a, b);
  return bracket.final;
}

export function advanceBracket(bracket: PlayoffBracket): void {
  const result = bracket.final?.result;
  if (!result) return;
  if (!result.winnerId) throw new Error(`Playoff match ${result.matchId} finished without a winner`);
  bracket.championId = result.winnerId;
}

function playoffMatch(
  bracket: PlayoffBracket,
  season: number,
  week: number,
  stage: ScheduledMatch['stage'],
  tag: string,
  a: string,
  b: string,
): ScheduledMatch {
  const [homeId, awayId] = sortBySeed(bracket, [a, b]);
  return { id: matchId(season, tag, homeId, awayId), week, round: 0, homeId, awayId, stage };
}

function sortBySeed(bracket: PlayoffBracket, teamIds: string[]): string[] {
  return teamIds.slice().sort((x, y) => seedIndex(bracket, x) - seedIndex(bracket, y));
}

/** Winners of a playoff round, or null while any match is unplayed. */
function winnersOf(matches: ScheduledMatch[]): string[] | null {
  const winners: string[] = [];
  for (const match of matches) {
    if (!match.result) return null;
    if (!match.result.winnerId) throw new Error(`Playoff match ${match.id} finished without a winner`);
    winners.push(match.result.winnerId);
  }
  return winners;
}
