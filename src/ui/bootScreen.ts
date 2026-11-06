/**
 * The loading screen in index.html (#boot) is plain HTML, so it shows on the first frame,
 * before any script or the stylesheet has arrived. This file moves its bar through the real
 * start-up steps and fades it away once the title screen is drawn underneath, so the page
 * goes straight from loading to the title (or the studio card) with no blank moment.
 */
const FADE_MS = 350;

function bootEl(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('boot');
}

/** Moves the bar to `share` (0 to 1) of the way. */
export function bootStep(share: number): void {
  bootEl()?.style.setProperty('--boot-p', String(Math.max(0, Math.min(1, share))));
}

/** Fills the bar and fades the loading screen out over whatever is now on the page. */
export function bootDone(): void {
  const el = bootEl();
  if (!el || el.classList.contains('boot-out')) return;
  bootStep(1);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Two frames: the title screen paints underneath first, then the cover lifts off it.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.classList.add('boot-out');
      setTimeout(() => el.remove(), still ? 0 : FADE_MS);
    }),
  );
}

/** Start-up failed before the game could draw anything: show the error line and Reload. */
export function bootFailed(err: unknown): void {
  console.error('Season Ticket could not start:', err);
  const el = bootEl();
  if (!el) return;
  el.classList.remove('boot-out');
  el.classList.add('boot-failed');
}

/**
 * Resolves once the built stylesheet has loaded. The build makes it non-blocking (see
 * vite.config.ts) so the loading screen paints at once; the title must still wait for it.
 * In the dev server the styles come from the script itself and this resolves straight away.
 */
export function stylesReady(): Promise<void> {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][data-deferred]'));
  return Promise.all(
    links.map(
      (link) =>
        new Promise<void>((resolve) => {
          if (link.media === 'all') return resolve();
          const done = (): void => {
            link.media = 'all';
            resolve();
          };
          link.addEventListener('load', done, { once: true });
          // A failed stylesheet still lets the game start (plainly drawn) rather than hang.
          link.addEventListener('error', done, { once: true });
        }),
    ),
  ).then(() => undefined);
}
