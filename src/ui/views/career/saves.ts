/** Game over, and the save-code screen (copy, backup file, back). */
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

/** What the save-code screen says about keeping the career safe on this device. */
export interface SaveSafetyView {
  /** "Storage: ..." line, or '' to hide it when the browser has no storage API. */
  storage: string;
  /** "3 November 2026", or null if this career has no backup on this device yet. */
  lastBackup: string | null;
}

export function renderSaveCode(ui: UiState, safety: SaveSafetyView): string {
  return `<main class="shell">
    <section class="card">
      <div class="card-title">Your save code</div>
      <p class="muted small">This code is the whole career. Keep it somewhere safe, then paste it on the title screen of any browser to carry on. It is long; copy all of it.</p>
      <textarea id="save-code" class="field code-field" rows="8" readonly spellcheck="false">${esc(ui.saveCode)}</textarea>
      <p class="muted small">${ui.saveCode.length.toLocaleString('en-US')} characters.</p>
      <div class="row-actions">
        <button type="button" data-action="copy-code">Copy</button>
        <button type="button" class="btn-secondary" data-action="download-code">Save backup file</button>
        <button type="button" class="btn-secondary" data-action="back">Back</button>
      </div>
      <p class="muted small">A backup file holds the same code. On a phone, choose Save to Files. Load it from the title screen with Load backup file.</p>
      <p class="muted small" data-last-backup>${safety.lastBackup ? `Last backup on this device: ${esc(safety.lastBackup)}.` : 'No backup of this career on this device yet.'}</p>
      <p class="muted small" data-storage-line${safety.storage ? '' : ' hidden'}>${esc(safety.storage)}</p>
    </section>
  </main>`;
}
