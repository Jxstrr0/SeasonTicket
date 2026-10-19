/** Career title screen: continue, start a new career, or paste a save code. */
import { esc } from '../../html';
import type { UiState } from '../../career/state';

export type TitleState = UiState['title'];
import { renderCrest } from './crest';
import { GAME_VERSION } from '../../career/report';

export function renderCareerTitle(title: TitleState): string {
  const { saved, error, importText, backup, confirm } = title;
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
      ${saved ? '<p class="muted small">When you press Start, the saved career is put aside as a backup you can bring back here.</p>' : ''}
    </div>
    ${confirm && saved ? renderConfirm(confirm, saved) : renderImport(importText, !!saved)}
    ${backup ? renderBackup(backup) : ''}
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

function renderImport(importText: string, saved: boolean): string {
  return `<form class="card" data-form="import">
      <label class="card-title" for="import-code">Load a save code</label>
      <textarea id="import-code" name="code" class="field code-field" rows="3" placeholder="ST1:..." spellcheck="false" autocomplete="off">${esc(importText)}</textarea>
      <button type="submit" class="btn-secondary">Load code</button>
      ${saved ? '<p class="muted small">Loading a code replaces the saved career. The saved one is put aside as a backup first.</p>' : ''}
    </form>`;
}

/** Load code over a saved career: say what goes where before anything changes (Stage 7.8). */
function renderConfirm(incoming: { club: string; season: number }, saved: TitleState['saved'] & object): string {
  return `<section class="card notice" role="alert">
      <div class="card-title">Replace your career?</div>
      <p>The code holds <strong>${esc(incoming.club)}</strong>, season ${esc(incoming.season)}. It replaces <strong>${esc(saved.club)}</strong>, season ${esc(saved.season)}.</p>
      <p class="muted small">${esc(saved.club)} is kept as a backup: you can bring it back from this screen.</p>
      <div class="row-actions">
        <button type="button" data-action="import-confirm">Replace and load</button>
        <button type="button" class="btn-secondary" data-action="import-cancel">Cancel</button>
      </div>
    </section>`;
}

function renderBackup(backup: NonNullable<TitleState['backup']>): string {
  return `<div class="card continue-card backup-card">
      ${renderCrest(backup.crest, 40)}
      <div class="continue-info">
        <div class="card-title">Backup: ${esc(backup.club)}</div>
        <div class="muted small">Season ${esc(backup.season)}. Put aside by the last code or new career. Bringing it back puts the current career aside instead.</div>
      </div>
      <button type="button" class="btn-secondary" data-action="restore-backup">Bring it back</button>
    </div>`;
}
