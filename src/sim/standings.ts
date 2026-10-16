/**
 * The league table. Order: points, goal difference, goals for, head-to-head
 * points between the tied clubs, then a seeded coin flip.
 *
 * The coin flip draws one random key per club, in the order of `teamIds`,
 * before any sorting, so the same rng seed always breaks the same ties the
 * same way and nothing depends on how the matches were listed.
 */
import { SEASON_TUNING } from './data';
import type { Rng } from './rng';
import type { MatchResult, ScheduledMatch, StandingsRow } from './types';

const POINTS = SEASON_TUNING.points;

export type PlayedMatch = ScheduledMatch & { result: MatchResult };

export function computeStandings(teamIds: string[], matches: ScheduledMatch[], rng: Rng): StandingsRow[] {
  const played = leagueResults(matches);
  const rows = new Map<string, StandingsRow>(teamIds.map((id) => [id, emptyRow(id)]));
  for (const match of played) recordMatch(rows, match);
  for (const row of rows.values()) row.form = formOf(row.teamId, played);
  const coinFlip = new Map(teamIds.map((id) => [id, rng.next()]));
  return orderRows([...rows.values()], played, coinFlip);
}

export function emptyRow(teamId: string): StandingsRow {
  return { teamId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, form: [] };
}

/** League matches with a result, in calendar order. */
function leagueResults(matches: ScheduledMatch[]): PlayedMatch[] {
  return matches
    .filter((m): m is PlayedMatch => m.stage === 'league' && m.result !== undefined)
    .slice()
    .sort((a, b) => a.week - b.week || a.round - b.round);
}

function recordMatch(rows: Map<string, StandingsRow>, match: PlayedMatch): void {
  const { homeScore, awayScore } = match.result;
  const home = rows.get(match.homeId);
  const away = rows.get(match.awayId);
  if (home) addScore(home, homeScore, awayScore);
  if (away) addScore(away, awayScore, homeScore);
}

function addScore(row: StandingsRow, scored: number, conceded: number): void {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  const outcome = outcomeOf(scored, conceded);
  if (outcome === 'W') row.won += 1;
  else if (outcome === 'D') row.drawn += 1;
  else row.lost += 1;
  row.points += pointsFor(outcome);
}

export function outcomeOf(scored: number, conceded: number): 'W' | 'D' | 'L' {
  if (scored > conceded) return 'W';
  return scored === conceded ? 'D' : 'L';
}

function pointsFor(outcome: 'W' | 'D' | 'L'): number {
  if (outcome === 'W') return POINTS.win;
  return outcome === 'D' ? POINTS.draw : POINTS.loss;
}

/** Last results, oldest first. */
function formOf(teamId: string, played: PlayedMatch[]): string[] {
  const results = played
    .filter((m) => m.homeId === teamId || m.awayId === teamId)
    .map((m) => {
      const home = m.homeId === teamId;
      const scored = home ? m.result.homeScore : m.result.awayScore;
      const conceded = home ? m.result.awayScore : m.result.homeScore;
      return outcomeOf(scored, conceded);
    });
  return results.slice(-SEASON_TUNING.formLength);
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

function byRecord(a: StandingsRow, b: StandingsRow): number {
  return b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;
}

function orderRows(rows: StandingsRow[], played: PlayedMatch[], coinFlip: Map<string, number>): StandingsRow[] {
  const sorted = rows.slice().sort(byRecord);
  const out: StandingsRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && byRecord(sorted[i], sorted[j]) === 0) j++;
    out.push(...breakTie(sorted.slice(i, j), played, coinFlip));
    i = j;
  }
  return out;
}

/** Clubs level on points, goal difference and goals for: head-to-head points among them, then the coin flip. */
function breakTie(group: StandingsRow[], played: PlayedMatch[], coinFlip: Map<string, number>): StandingsRow[] {
  if (group.length < 2) return group;
  const h2h = headToHeadPoints(group.map((r) => r.teamId), played);
  const flip = (id: string) => coinFlip.get(id) ?? 0;
  return group.slice().sort((a, b) => (h2h.get(b.teamId) ?? 0) - (h2h.get(a.teamId) ?? 0) || flip(b.teamId) - flip(a.teamId));
}

export function headToHeadPoints(teamIds: string[], played: PlayedMatch[]): Map<string, number> {
  const group = new Set(teamIds);
  const points = new Map<string, number>(teamIds.map((id) => [id, 0]));
  for (const m of played) {
    if (!group.has(m.homeId) || !group.has(m.awayId)) continue;
    const { homeScore, awayScore } = m.result;
    points.set(m.homeId, (points.get(m.homeId) ?? 0) + pointsFor(outcomeOf(homeScore, awayScore)));
    points.set(m.awayId, (points.get(m.awayId) ?? 0) + pointsFor(outcomeOf(awayScore, homeScore)));
  }
  return points;
}
