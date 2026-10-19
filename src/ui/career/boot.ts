/**
 * The start-up screen (Stage 7.4). The title screen is drawn by this small script while the
 * rest of the game downloads, so a phone shows something to tap within a moment. A tap that
 * lands before the game is ready is kept and replayed on the real title screen once it is.
 */
import { renderCareerTitle } from '../views/career/title';
import { loadTitleSummary } from './titleSummary';
import { installCrashGuard, showCrash } from './crash';
import { registerServiceWorker } from '../../pwa/register';
import { setTitleBackdrop } from './titleBackdrop';
import { playSplash } from './splash';

type Pending = { action: string } | { code: string } | null;

export function bootCareer(root: HTMLElement): void {
  installCrashGuard();
  registerServiceWorker();
  const layer = document.createElement('div');
  layer.id = 'ui-layer';
  layer.innerHTML = renderCareerTitle({ saved: loadTitleSummary(), error: null, importText: '', backup: null, confirm: null });
  root.replaceChildren(layer);
  setTitleBackdrop(true);
  playSplash();

  let pending: Pending = null;
  const busy = (el: Element | null) => {
    if (el instanceof HTMLButtonElement) {
      el.disabled = true;
      el.textContent = 'Loading…';
    }
  };
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest('[data-action]');
    if (!el || pending) return;
    pending = { action: (el as HTMLElement).dataset.action ?? '' };
    busy(el);
  };
  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (pending) return;
    const form = e.target as HTMLFormElement;
    pending = { code: (form.elements.namedItem('code') as HTMLTextAreaElement | null)?.value ?? '' };
    busy(form.querySelector('button'));
  };
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);

  import('./app')
    .then(({ CareerApp }) => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('submit', onSubmit);
      new CareerApp(root);
      replay(root, pending);
    })
    .catch((err) => {
      // The game may have started to draw before it failed: then the crash screen is the way out.
      if (!root.contains(layer)) return showCrash(err);
      layer.insertAdjacentHTML(
        'afterbegin',
        '<p class="error shell" role="alert">The game could not finish loading. Check your connection, then <button type="button" class="btn-secondary" onclick="location.reload()">Reload</button></p>',
      );
    });
}

function replay(root: HTMLElement, pending: Pending): void {
  if (!pending) return;
  if ('action' in pending) {
    root.querySelector<HTMLElement>(`[data-action="${CSS.escape(pending.action)}"]`)?.click();
    return;
  }
  const form = root.querySelector<HTMLFormElement>('form[data-form="import"]');
  const field = form?.elements.namedItem('code');
  if (!form || !(field instanceof HTMLTextAreaElement)) return;
  field.value = pending.code;
  form.requestSubmit();
}
