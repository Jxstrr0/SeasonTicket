/** "Playing the week...": over the screen while the week's matches play in the background. */
import { esc } from '../../html';
import type { WeekRun } from '../../career/state';

export function weekRunCount(run: WeekRun): string {
  if (run.total === 0) return 'Setting up the matches';
  return `${run.done} of ${run.total} matches played`;
}

export function renderWeekRun(run: WeekRun): string {
  const pct = run.total ? Math.round((100 * run.done) / run.total) : 0;
  const stop = run.toEnd ? '<button type="button" class="btn-secondary" data-action="stop-sim">Stop after this week</button>' : '';
  return `<div class="week-run" role="status" aria-live="polite">
    <div class="week-run-card card">
      <p class="week-run-title">${run.toEnd ? 'Playing to the end of the season...' : 'Playing the week...'}</p>
      <p class="muted small week-run-label">${esc(run.label)}</p>
      <div class="week-run-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <p class="muted small week-run-count">${esc(weekRunCount(run))}</p>
      ${stop}
    </div>
  </div>`;
}
