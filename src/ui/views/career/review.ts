/** The season review: where the club finished, the money, past seasons, and the way into the off-season. */
import { ledgerTotals, money, userBooks, userTeam, type Career, type SeasonHistoryEntry } from '../../../sim/career';
import { renderPlayoffs } from '../bracket';
import { renderSummary } from '../summary';
import { renderTable } from '../table';
import { cls, each, esc } from '../../html';
import { renderCrest } from './crest';

const PLAYOFF_TEXT: Record<SeasonHistoryEntry['playoff'], string> = {
  none: 'Missed the playoffs',
  bye: 'Bye',
  quarterFinal: 'Quarter-final',
  semiFinal: 'Semi-final',
  runnerUp: 'Runner-up',
  champion: 'Champions',
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function renderHistory(history: readonly SeasonHistoryEntry[]): string {
  if (!history.length) return '';
  return `<section class="card">
    <div class="card-title">Your seasons</div>
    <div class="scroll-x"><table class="data-table">
      <thead><tr><th>Season</th><th class="num">Pos</th><th class="num">Pts</th><th>Playoffs</th><th class="num">Profit</th><th>Top scorer</th></tr></thead>
      <tbody>${each(history.slice().reverse(), (h) => `<tr>
        <td>${h.season}</td>
        <td class="num">${ordinal(h.position)}</td>
        <td class="num">${h.points}</td>
        <td>${esc(PLAYOFF_TEXT[h.playoff])}</td>
        <td class="${cls('num', h.profit < 0 && 'negative')}">${esc(money(h.profit))}</td>
        <td>${h.topScorer ? `${esc(h.topScorer.name)} (${h.topScorer.goals})` : '-'}</td>
      </tr>`)}</tbody>
    </table></div>
  </section>`;
}

export function renderReview(career: Career): string {
  const season = career.season;
  const team = userTeam(career);
  const pos = season.standings.findIndex((r) => r.teamId === career.userTeamId) + 1;
  const row = season.standings[pos - 1];
  const t = ledgerTotals(userBooks(career).ledger);
  return `<main class="shell review">
    <section class="card review-head">
      ${renderCrest(career.crest, 64)}
      <div>
        <h1 class="review-title">Season ${season.league.season} is over</h1>
        <p>${esc(team.name)} finished <strong>${ordinal(pos)}</strong> with ${row?.points ?? 0} points.
        The season ${t.profit >= 0 ? 'made' : 'lost'} <strong class="${cls(t.profit < 0 && 'negative')}">${esc(money(Math.abs(t.profit)))}</strong>.</p>
      </div>
    </section>
    <section class="card notice">
      <p>The off-season runs contracts, retirements, player development, staff renewals and the youth intake, then the summer transfer window opens.</p>
      <div class="row-actions">
        <button type="button" data-action="start-offseason">Start the off-season</button>
        <button type="button" class="btn-secondary" data-action="to-hub">Back to the office</button>
      </div>
    </section>
    ${renderSummary(season)}
    <div class="review-grid">
      <div>${renderTable(season)}</div>
      <div>${renderPlayoffs(season)}</div>
    </div>
    ${renderHistory(career.history)}
  </main>`;
}
