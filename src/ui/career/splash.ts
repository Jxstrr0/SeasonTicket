/**
 * The studio card before the title (Stage 7.6): the Longlight mark, the studio name and
 * "presents", for under two seconds, once per visit. A tap skips it, and it never shows to
 * anyone who has asked their phone for less motion. It sits over the title screen, which
 * is already live underneath, so nothing waits for it.
 */
import { longlightMark } from '../brand';

const KEY = 'seasonticket.splash';
const SHOW_MS = 1800;
const FADE_MS = 450;

export function playSplash(): void {
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
  } catch {
    // No session storage: show it, it is short.
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.createElement('div');
  el.className = 'splash';
  el.setAttribute('role', 'presentation');
  el.innerHTML = `${longlightMark('longlight-mark splash-mark')}
    <div class="brand-caps splash-studio">Longlight Interactive</div>
    <div class="splash-presents">presents</div>`;
  let gone = false;
  const close = (): void => {
    if (gone) return;
    gone = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), FADE_MS);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(el);
  setTimeout(close, SHOW_MS);
}
