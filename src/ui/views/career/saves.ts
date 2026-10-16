/** Game over, and the save-code screen (copy, download, back). */
import type { Career } from '../../../sim/career';
import { esc } from '../../html';
import type { UiState } from '../../career/state';
import { renderHistory } from './review';

export function renderGameOver(career: Career | null): string {
  const reason = career?.gameOverReason ?? 'The career is over.';
  return `<main class="shell">
    <section class="card notice game-over">
      <h1>Game over</h1>
      <p>${esc(reason)}</p>
      <div class="row-actions">
        <button type="button" data-action="new-career">Start a new career</button>
        <button type="button" class="btn-secondary" data-action="to-title">Title screen</button>
      </div>
    </section>
    ${career ? renderHistory(career.history) : ''}
  </main>`;
}

export function renderSaveCode(ui: UiState): string {
  return `<main class="shell">
    <section class="card">
      <div class="card-title">Your save code</div>
      <p class="muted small">This code is the whole career. Keep it somewhere safe, then paste it on the title screen of any browser to carry on. It is long; copy all of it.</p>
      <textarea id="save-code" class="field code-field" rows="8" readonly spellcheck="false">${esc(ui.saveCode)}</textarea>
      <p class="muted small">${ui.saveCode.length.toLocaleString('en-US')} characters.</p>
      <div class="row-actions">
        <button type="button" data-action="copy-code">Copy</button>
        <button type="button" class="btn-secondary" data-action="download-code">Download .txt</button>
        <button type="button" class="btn-secondary" data-action="back">Back</button>
      </div>
    </section>
  </main>`;
}
