/**
 * The safety net (Stage 7.5). If the game breaks, a calm screen offers "Reload", "Copy save
 * code" and "Report the problem" instead of a blank or frozen page.
 *
 * The save is never lost to a crash: the game saves after every action, so the stored save
 * is from before the problem, and once the crash screen is up nothing saves again (the
 * career in memory may be half way through the action that broke). Reloading carries on
 * from the stored save.
 *
 * This file is plain DOM with no game imports, so the start-up script installs it before
 * the rest of the game has downloaded.
 */
import { esc } from '../html';
import { copyText } from '../clipboard';
import { STORAGE_KEY, freezeSaves } from '../../game/saveKey';
import { buildReport, CONTACT_URL, deviceSummary, errorSummary } from './report';
import { loadTitleSummary } from './titleSummary';

let crashed = false;
let installed = false;
let where: () => string | null = () => {
  const s = loadTitleSummary();
  return s ? `${s.club}, season ${s.season}` : null;
};

/** True once the crash screen has shown: the game must not save after that. */
export function hasCrashed(): boolean {
  return crashed;
}

/** Lets the running game say where the career is ("Club, season 2, week 14") for reports. */
export function setCrashWhere(fn: () => string | null): void {
  where = fn;
}

/** Errors that are not the game breaking: other sites' scripts and browser noise. */
export function isNoise(err: unknown, message = ''): boolean {
  if (!err && /^Script error\.?$/i.test(message)) return true;
  if (/ResizeObserver loop/i.test(message || (err instanceof Error ? err.message : ''))) return true;
  // Rejected browser promises (sound not allowed yet, a cancelled fullscreen or load):
  // the game carries on, so they are no crash.
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) return true;
  return false;
}

export function installCrashGuard(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    if (isNoise(e.error, e.message)) return;
    showCrash(e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (isNoise(e.reason)) return;
    showCrash(e.reason);
  });
}

/** The save code the browser holds (the game writes it after every action). */
export function storedSave(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Shows the crash screen (once) and stops all saving. */
export function showCrash(err: unknown): void {
  console.error('Season Ticket crashed:', err);
  if (crashed) return;
  crashed = true;
  freezeSaves();
  let place: string | null = null;
  try {
    place = where();
  } catch {
    place = null;
  }
  const error = errorSummary(err);
  const save = storedSave();
  const box = document.createElement('div');
  box.className = 'crash';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-labelledby', 'crash-title');
  box.innerHTML = `<section class="card crash-card">
    <h1 id="crash-title">Something went wrong</h1>
    <p>Sorry, the game hit a problem it could not get past. ${save ? 'Your career is safe: it is kept as it was saved just before this happened. Reload to carry on.' : 'Reload to start again.'}</p>
    <div class="row-actions">
      <button type="button" data-crash="reload">Reload</button>
      ${save ? '<button type="button" class="btn-secondary" data-crash="copy-save">Copy save code</button>' : ''}
      <button type="button" class="btn-secondary" data-crash="report">Report the problem</button>
    </div>
    <p class="crash-status small" role="status"></p>
    <div class="crash-report" hidden>
      <p class="small">1. Tap <strong>Copy report</strong>. 2. Tap <strong>Open the contact form</strong>, paste the report into the message box and say what you were doing.</p>
      <textarea class="field code-field" rows="5" readonly spellcheck="false" aria-label="Problem report"></textarea>
      <div class="row-actions">
        <button type="button" data-crash="copy-report">Copy report</button>
        <a class="btn btn-secondary" href="${esc(CONTACT_URL)}" target="_blank" rel="noopener">Open the contact form</a>
      </div>
    </div>
    <p class="muted small crash-error">${esc(error)}</p>
  </section>`;
  document.body.append(box);

  const status = box.querySelector<HTMLElement>('.crash-status')!;
  const area = box.querySelector<HTMLTextAreaElement>('.crash-report textarea')!;
  const fill = (): void => {
    area.value = buildReport({ where: place, error, device: deviceSummary() });
  };
  const copied = (ok: boolean, what: string): void => {
    status.textContent = ok ? `${what} copied.` : 'Copy was blocked. The text is selected: use your phone’s Copy.';
  };
  box.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-crash]');
    switch (el?.dataset.crash) {
      case 'reload':
        location.reload();
        return;
      case 'copy-save': {
        // Copy straight from the store; with the clipboard blocked, show it to copy by hand.
        void copyText(save ?? '', null).then((ok) => {
          if (ok) return copied(true, 'Save code');
          box.querySelector<HTMLElement>('.crash-report')!.hidden = false;
          area.value = save ?? '';
          void copyText(area.value, area).then((again) => copied(again, 'Save code'));
        });
        return;
      }
      case 'report':
        box.querySelector<HTMLElement>('.crash-report')!.hidden = false;
        fill();
        return;
      case 'copy-report':
        fill();
        void copyText(area.value, area).then((ok) => copied(ok, 'Report'));
        return;
    }
  });
  box.querySelector<HTMLButtonElement>('[data-crash="reload"]')?.focus();
}
