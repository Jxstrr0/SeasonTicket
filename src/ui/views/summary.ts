/** A small card with the season's headline numbers, shown once it is over. */
import { seasonSummary, type SeasonState } from '../../sim/season';
import { WORLD } from '../../sim/data';
import { clubCell, percent, playerName, team } from '../format';
import { each, esc } from '../html';

/** How many scorers the card lists; the sim's summary may return more. */
const SCORERS_SHOWN = 3;

export function renderSummary(season: SeasonState): string {
  if (season.phase !== 'complete') return '';
  const league = season.league;
  const s = seasonSummary(season);
  const scorers = s.topScorers.slice(0, SCORERS_SHOWN);
  const champion = s.champion ? clubCell(team(league, s.champion)) : '-';
  const shield = s.shield ? clubCell(team(league, s.shield)) : '-';
  return `
  <section class="card summary-card">
    <h2 class="card-title summary-title">Season ${league.season} summary</h2>
    <div class="summary-block">
      <span class="summary-label">${esc(WORLD.league.playoffTrophy)}</span>
      <span class="summary-value">${champion}</span>
    </div>
    <div class="summary-block">
      <span class="summary-label">${esc(WORLD.league.tableTrophy)}</span>
      <span class="summary-value">${shield}</span>
    </div>
    <div class="summary-block scorers-block">
      <span class="summary-label">Top scorers</span>
      <ol class="summary-scorers">${each(scorers, (row) => {
        const p = league.players[row.playerId];
        const club = p?.teamId ? team(league, p.teamId) : null;
        return `<li>${esc(playerName(league, row.playerId))} <span class="muted">${club ? esc(club.abbr) : ''}</span> <strong>${row.goals}</strong></li>`;
      })}</ol>
    </div>
    <div class="summary-block">
      <span class="summary-label">Goals per match</span>
      <span class="summary-value">${s.avgGoals.toFixed(2)}</span>
    </div>
    <div class="summary-block">
      <span class="summary-label">Home wins</span>
      <span class="summary-value">${percent(s.homeWinRate)}</span>
    </div>
  </section>`;
}
