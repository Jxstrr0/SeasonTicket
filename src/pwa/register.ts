/**
 * Installs the service worker (src/pwa/serviceWorker.ts) on the built site, and says when an
 * update is ready: a small banner with "Reload" (Stage 7.5). The new version only takes
 * over when the player taps it, so a match in progress is never cut off.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // After the page has loaded, so the worker's downloads don't slow the first screen.
  const start = (): void => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        const offer = (worker: ServiceWorker | null): void => {
          // The first install has no old version to replace.
          if (worker && navigator.serviceWorker.controller) showUpdate(worker);
        };
        offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          next?.addEventListener('statechange', () => {
            if (next.state === 'installed') offer(next);
          });
        });
        // Phones keep a tab open for days: look for an update whenever the game comes back.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {});
        });
      })
      .catch(() => {
        // No offline play (a private window, say): the game works as a normal page.
      });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

let shown = false;

function showUpdate(worker: ServiceWorker): void {
  if (shown) return;
  shown = true;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>A new version of Season Ticket is ready.</span>
    <button type="button" data-update="reload">Reload</button>
    <button type="button" class="btn-secondary" data-update="later">Later</button>`;
  bar.addEventListener('click', (e) => {
    const what = (e.target as Element | null)?.closest<HTMLElement>('[data-update]')?.dataset.update;
    if (what === 'later') bar.remove();
    if (what !== 'reload') return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    worker.postMessage('skip-waiting');
  });
  document.body.append(bar);
}
