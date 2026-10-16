/**
 * The page's view state and the read-only questions the views ask of the
 * season (which weeks have results, what the top bar should say). These only
 * read SeasonState; every change to the season goes through src/sim.
 */
import { matchesForWeek, type SeasonState } from '../sim/season';
import type { ScheduledMatch } from '../sim/types';
import { stagePlural } from './format';

export type Tab = 'table' | 'results' | 'playoffs';

export const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'table', label: 'Table' },
  { id: 'results', label: 'Results' },
  { id: 'playoffs', label: 'Playoffs' },
];

export interface SeasonView {
  season: SeasonState;
  seed: string;
  tab: Tab;
  /** Week shown on the Results tab; null follows the latest played week. */
  resultsWeek: number | null;
  /** Match whose feed is open, or null for the tab content. */
  openMatchId: string | null;
  showAllEvents: boolean;
  /** True while "Sim to end" is stepping through weeks. */
  running: boolean;
  error: string | null;
}

export interface TitleView {
  seed: string;
  error: string | null;
}

export type UiState = { screen: 'title'; title: TitleView } | { screen: 'season'; view: SeasonView };

/** Calendar weeks that have at least one played match, in order. */
export function playedWeeks(season: SeasonState): number[] {
  const weeks = new Set<number>();
  for (const m of season.schedule.matches) if (m.result) weeks.add(m.week);
  return [...weeks].sort((a, b) => a - b);
}

/** The week the Results tab should show: the picked one if it has results, else the latest. */
export function resultsWeekFor(view: SeasonView): number | null {
  const weeks = playedWeeks(view.season);
  if (weeks.length === 0) return null;
  if (view.resultsWeek !== null && weeks.includes(view.resultsWeek)) return view.resultsWeek;
  return weeks[weeks.length - 1];
}

/** The played week before or after the given one, or null at either end. */
export function neighbourWeek(season: SeasonState, week: number, step: -1 | 1): number | null {
  const weeks = playedWeeks(season);
  const i = weeks.indexOf(week);
  if (i < 0) return null;
  return weeks[i + step] ?? null;
}

export function playedMatches(season: SeasonState, week: number): ScheduledMatch[] {
  return matchesForWeek(season, week).filter((m) => m.result);
}

export function findMatch(season: SeasonState, id: string): ScheduledMatch | null {
  return season.schedule.matches.find((m) => m.id === id) ?? null;
}

/** "Week 12 of 35", "Week 16 of 35 · Break", "Playoffs · Semi-finals" or "Season complete". */
export function statusLabel(season: SeasonState): string {
  const total = season.schedule.weeks;
  switch (season.phase) {
    case 'regular':
      return `Week ${season.week} of ${total}`;
    case 'break':
      return `Week ${season.week} of ${total} · Break`;
    case 'playoffs': {
      const next = matchesForWeek(season, season.week).find((m) => !m.result);
      return next ? `Playoffs · ${stagePlural(next.stage)}` : 'Playoffs';
    }
    case 'complete':
      return 'Season complete';
  }
}

/** Share of the calendar already played, 0-1, for the progress bar. */
export function seasonProgress(season: SeasonState): number {
  if (season.phase === 'complete') return 1;
  const total = season.schedule.weeks;
  return total > 0 ? Math.min(1, (season.week - 1) / total) : 0;
}

/** A short label for a calendar week on the Results tab. */
export function weekLabel(season: SeasonState, week: number): string {
  const matches = matchesForWeek(season, week);
  const first = matches[0];
  if (!first) return `Week ${week}`;
  if (first.stage === 'league') return `Week ${week} · Round ${first.round}`;
  return `Week ${week} · ${stagePlural(first.stage)}`;
}
