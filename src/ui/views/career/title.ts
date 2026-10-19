/** Career title screen: continue, start a new career, or paste a save code. */
import { esc } from '../../html';
import type { UiState } from '../../career/state';

export type TitleState = UiState['title'];
import { renderCrest } from './crest';
import { GAME_VERSION } from '../../career/report';

export function renderCareerTitle(title: TitleState): string {
  const { saved, error, importText } = title;
  const continueCard = saved
    ? `<div class="card continue-card">
        ${renderCrest(saved.crest, 56)}
        <div class="continue-info">
          <div class="card-title">${esc(saved.club)}</div>
          <div class="muted small">Season ${esc(saved.season)}</div>
        </div>
        <button type="button" data-action="continue">Continue</button>
      </div>`
    : '';
  return `<main class="shell title-screen">
    <header class="masthead">
      <h1>Season Ticket</h1>
      <p class="tagline">Own the club. Hire the coach. Change the game from the touchline.</p>
    </header>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    ${continueCard}
    <div class="card">
      <div class="card-title">New career</div>
      <p class="muted small">Pick a club in the Kestrel Football League, make it yours, and keep it solvent.</p>
      <button type="button" data-action="new-career">${saved ? 'Start a new career' : 'Start a career'}</button>
      ${saved ? '<p class="muted small">Starting a new career replaces the saved one when you press Start.</p>' : ''}
    </div>
    <form class="card" data-form="import">
      <label class="card-title" for="import-code">Load a save code</label>
      <textarea id="import-code" name="code" class="field code-field" rows="3" placeholder="ST1:..." spellcheck="false" autocomplete="off">${esc(importText)}</textarea>
      <button type="submit" class="btn-secondary">Load code</button>
    </form>
    <p class="center row-actions title-links">
      <button type="button" class="btn-secondary" data-action="help">How to play</button>
      <button type="button" class="btn-secondary" data-action="contact">Report a problem</button>
      <button type="button" class="btn-secondary" data-action="whats-new">What's new</button>
      <button type="button" class="btn-secondary" data-action="credits">Credits</button>
    </p>
    <p class="center muted small">Version ${esc(GAME_VERSION)}</p>
    <p class="center small"><a class="link" href="#sandbox">League sandbox (watch a season, no club)</a></p>
    <p class="center small"><a class="link" href="#engine-lab">Engine lab (preview of the new match engine)</a></p>
  </main>`;
}
