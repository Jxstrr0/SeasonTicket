/** League table: standings with the playoff line, the leader and recent form. */
import { SEASON_TUNING, WORLD } from '../../sim/data';
import type { SeasonState } from '../../sim/season';
import type { League, StandingsRow } from '../../sim/types';
import { clubCell, signed, team } from '../format';
import { cls, each, esc } from '../html';

const FORM_CLASS: Record<string, string> = { W: 'win', D: 'draw', L: 'loss' };
const FORM_WORD: Record<string, string> = { W: 'won', D: 'drew', L: 'lost' };

/** Five dots, newest on the right; empty dots before a club has played five. */
export function formDots(form: readonly string[]): string {
  const length = SEASON_TUNING.formLength;
  const recent = form.slice(-length);
  const padded = [...Array<string>(length - recent.length).fill(''), ...recent];
  const words = recent.map((r) => FORM_WORD[r] ?? r).join(', ');
  return `<span class="form" role="img" aria-label="${esc(words ? `Last results: ${words}` : 'No results yet')}">${each(
    padded,
    (r) => `<span class="${cls('dot', FORM_CLASS[r])}"></span>`,
  )}</span>`;
}

export function renderTableRow(league: League, row: StandingsRow, index: number, playoffSpots: number): string {
  const t = team(league, row.teamId);
  const pos = index + 1;
  const classes = cls(pos <= playoffSpots && 'playoff', pos === playoffSpots && 'playoff-line', pos === 1 && row.played > 0 && 'leader');
  return `<tr class="${classes}">
    <td class="num pos">${pos}</td>
    <td class="club">${clubCell(t)}</td>
    <td class="num">${row.played}</td>
    <td class="num">${row.won}</td>
    <td class="num">${row.drawn}</td>
    <td class="num">${row.lost}</td>
    <td class="num opt">${row.goalsFor}</td>
    <td class="num opt">${row.goalsAgainst}</td>
    <td class="num">${signed(row.goalDifference)}</td>
    <td class="num pts">${row.points}</td>
    <td class="form-cell">${formDots(row.form)}</td>
  </tr>`;
}

export function renderTable(season: SeasonState): string {
  const spots = SEASON_TUNING.playoffs.teams;
  const rows = season.standings;
  return `
  <section class="card table-card">
    <div class="scroll-x">
      <table class="standings">
        <thead>
          <tr>
            <th class="num" scope="col" title="Position">#</th>
            <th scope="col">Club</th>
            <th class="num" scope="col" title="Played">P</th>
            <th class="num" scope="col" title="Won">W</th>
            <th class="num" scope="col" title="Drawn">D</th>
            <th class="num" scope="col" title="Lost">L</th>
            <th class="num opt" scope="col" title="Goals for">GF</th>
            <th class="num opt" scope="col" title="Goals against">GA</th>
            <th class="num" scope="col" title="Goal difference">GD</th>
            <th class="num" scope="col" title="Points">Pts</th>
            <th scope="col">Form</th>
          </tr>
        </thead>
        <tbody>${each(rows, (row, i) => renderTableRow(season.league, row, i, spots))}</tbody>
      </table>
    </div>
    <p class="muted small legend">
      <span class="legend-swatch playoff"></span> Top ${spots} reach the playoffs for the ${esc(WORLD.league.playoffTrophy)}.
      The leader after the last round wins the ${esc(WORLD.league.tableTrophy)}.
    </p>
  </section>`;
}
