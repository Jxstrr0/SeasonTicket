/** The season screen: top bar, summary card, tabs and the active tab or match feed. */
import { esc } from '../html';
import { findMatch, resultsWeekFor, type SeasonView } from '../model';
import { renderPlayoffs } from './bracket';
import { renderMatchFeed } from './matchFeed';
import { renderResults } from './results';
import { renderSummary } from './summary';
import { renderTable } from './table';
import { renderTabs, renderTopBar } from './topbar';

function renderContent(view: SeasonView): string {
  const { season } = view;
  if (view.openMatchId !== null) {
    const match = findMatch(season, view.openMatchId);
    if (match) return renderMatchFeed(season.league, match, view.showAllEvents);
  }
  switch (view.tab) {
    case 'table':
      return renderTable(season);
    case 'results':
      return renderResults(season, resultsWeekFor(view));
    case 'playoffs':
      return renderPlayoffs(season);
  }
}

export function renderSeason(view: SeasonView): string {
  return `
  ${renderTopBar(view)}
  <main class="shell season-screen">
    ${view.error ? `<p class="error card" role="alert">${esc(view.error)}</p>` : ''}
    ${view.openMatchId === null ? renderSummary(view.season) : ''}
    ${renderTabs(view)}
    <div class="tab-body">${renderContent(view)}</div>
    <p class="muted small footer">Seed ${esc(view.seed)}. Same seed, same season.</p>
  </main>`;
}
