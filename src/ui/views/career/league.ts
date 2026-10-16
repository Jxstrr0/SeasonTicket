/** League: the table, results week by week (with the match feed) and the playoffs. */
import type { Career } from '../../../sim/career';
import { cls, each, esc } from '../../html';
import { findMatch, playedWeeks } from '../../model';
import type { LeagueTab, UiState } from '../../career/state';
import { renderTable } from '../table';
import { renderResults } from '../results';
import { renderPlayoffs } from '../bracket';
import { renderMatchFeed } from '../matchFeed';
import { lastMatchFixture } from './home';

const LEAGUE_TABS: readonly { id: LeagueTab; label: string }[] = [
  { id: 'table', label: 'Table' },
  { id: 'results', label: 'Results' },
  { id: 'playoffs', label: 'Playoffs' },
];

/** The picked week if it has results, otherwise the last played week. */
export function careerResultsWeek(career: Career, picked: number | null): number | null {
  const weeks = playedWeeks(career.season);
  if (!weeks.length) return null;
  if (picked !== null && weeks.includes(picked)) return picked;
  return weeks[weeks.length - 1];
}

function renderOpenMatch(career: Career, ui: UiState): string | null {
  if (!ui.openMatchId) return null;
  // The owner's latest match is stored in full; older ones keep only key moments.
  const last = lastMatchFixture(career);
  const match = last && last.id === ui.openMatchId ? last : findMatch(career.season, ui.openMatchId);
  if (!match) return null;
  const note = match === last ? '' : '<p class="muted small center">Older matches keep only goals, red cards and injuries.</p>';
  return renderMatchFeed(career.season.league, match, ui.showAllEvents) + note;
}

export function renderLeague(career: Career, ui: UiState): string {
  const feed = renderOpenMatch(career, ui);
  if (feed) return feed;
  const season = career.season;
  const body = ui.leagueTab === 'table'
    ? renderTable(season)
    : ui.leagueTab === 'results'
      ? renderResults(season, careerResultsWeek(career, ui.resultsWeek), 'The first round is played after pre-season.')
      : renderPlayoffs(season);
  return `<div class="segmented" role="group" aria-label="League view">
    ${each(LEAGUE_TABS, (t) => `<button type="button" class="${cls('seg', t.id === ui.leagueTab && 'on')}" data-action="league-tab" data-tab="${t.id}" aria-pressed="${t.id === ui.leagueTab}">${esc(t.label)}</button>`)}
  </div>
  ${body}`;
}
