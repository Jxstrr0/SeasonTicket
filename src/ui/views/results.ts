/** Results tab: one played week at a time, each match a tappable row. */
import type { SeasonState } from '../../sim/season';
import type { League, MatchResult, ScheduledMatch } from '../../sim/types';
import { clubCell, stageLabel, team, weatherPill } from '../format';
import { esc, each } from '../html';
import { neighbourWeek, playedMatches, weekLabel } from '../model';

/** "a.e.t." and "pens 5-4" notes for a playoff result. */
export function resultNotes(result: MatchResult): string[] {
  const notes: string[] = [];
  if (result.extraTime) notes.push('a.e.t.');
  if (result.shootout) notes.push(`pens ${result.shootout.home}-${result.shootout.away}`);
  return notes;
}

export function renderResultRow(league: League, match: ScheduledMatch): string {
  const result = match.result;
  if (!result) return '';
  const home = team(league, match.homeId);
  const away = team(league, match.awayId);
  const notes = resultNotes(result);
  const meta = [match.stage !== 'league' ? stageLabel(match.stage) : '', ...notes].filter(Boolean).join(' · ');
  const winner = result.winnerId;
  return `
  <li>
    <button type="button" class="result-row" data-action="open-match" data-match="${esc(match.id)}"
      aria-label="${esc(`${home.shortName} ${result.homeScore}, ${away.shortName} ${result.awayScore}. Open match feed`)}">
      <span class="side home${winner === home.id ? ' won' : ''}">${clubCell(home)}</span>
      <span class="score">${result.homeScore}-${result.awayScore}</span>
      <span class="side away${winner === away.id ? ' won' : ''}">${clubCell(away)}</span>
      <span class="result-meta">${meta ? `<span class="muted small">${esc(meta)}</span>` : ''}${weatherPill(result.weather)}</span>
    </button>
  </li>`;
}

export function renderResults(season: SeasonState, week: number | null, emptyHint = 'Tap <strong>Sim week</strong> to play round 1.'): string {
  if (week === null) {
    return `<section class="card"><p class="muted">No matches played yet. ${emptyHint}</p></section>`;
  }
  const prev = neighbourWeek(season, week, -1);
  const next = neighbourWeek(season, week, 1);
  const matches = playedMatches(season, week);
  return `
  <section class="card results-card">
    <div class="week-picker">
      <button type="button" class="btn-icon" data-action="week" data-week="${prev ?? ''}" aria-label="Previous week"${prev === null ? ' disabled' : ''}>&#8249;</button>
      <span class="week-label">${esc(weekLabel(season, week))}</span>
      <button type="button" class="btn-icon" data-action="week" data-week="${next ?? ''}" aria-label="Next week"${next === null ? ' disabled' : ''}>&#8250;</button>
    </div>
    <ul class="result-list">${each(matches, (m) => renderResultRow(season.league, m))}</ul>
    <p class="muted small">Tap a match for the feed and stats.</p>
  </section>`;
}
