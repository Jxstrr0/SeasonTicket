/** Title screen: masthead, league name, seed field and the start buttons. */
import { CLUBS, SEASON_TUNING, WORLD } from '../../sim/data';
import { esc } from '../html';
import type { TitleView } from '../model';

export function renderTitle(view: TitleView): string {
  const league = WORLD.league;
  return `
  <main class="shell title-screen">
    <header class="masthead">
      <h1>Season Ticket</h1>
      <p class="tagline">Own the club. Run the business. Change the game.</p>
    </header>
    <section class="card title-card">
      <p class="league-name">${esc(league.name)}</p>
      <p class="muted">${CLUBS.length} clubs of ${esc(WORLD.country.name)}, ${SEASON_TUNING.calendar.roundsPerHalf * 2} rounds, then the top ${SEASON_TUNING.playoffs.teams} play off for the ${esc(league.playoffTrophy)}. The table winner lifts the ${esc(league.tableTrophy)}.</p>
      <form class="seed-form" data-form="start" autocomplete="off">
        <label class="seed-label" for="seed">Seed</label>
        <input id="seed" name="seed" class="seed-input" type="text" inputmode="numeric" maxlength="24" value="${esc(view.seed)}" aria-describedby="seed-help" />
        <button type="submit" class="btn-primary">Start season</button>
        <button type="button" class="btn-secondary" data-action="lucky">Lucky seed</button>
      </form>
      <p id="seed-help" class="muted small">The same seed always plays out the same season. Lucky seed picks a new one and starts.</p>
      ${view.error ? `<p class="error" role="alert">${esc(view.error)}</p>` : ''}
    </section>
  </main>`;
}
