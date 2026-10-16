/** The compact bar over the season screen: league, week, sim buttons and tabs. */
import { WORLD } from '../../sim/data';
import { cls, each, esc } from '../html';
import { TABS, seasonProgress, statusLabel, type SeasonView } from '../model';

export function renderTopBar(view: SeasonView): string {
  const { season, running } = view;
  const done = season.phase === 'complete';
  const lock = running ? ' disabled' : '';
  const simLock = running || done ? ' disabled' : '';
  return `
  <header class="topbar">
    <div class="topbar-title">
      <span class="topbar-league">${esc(WORLD.league.name)}</span>
      <span class="topbar-status" aria-live="polite">${esc(statusLabel(season))}${running ? ' · simulating' : ''}</span>
    </div>
    <div class="topbar-actions">
      <button type="button" data-action="sim-week"${simLock}>Sim week</button>
      <button type="button" data-action="sim-end"${simLock}>Sim to end</button>
      <button type="button" class="btn-secondary" data-action="new-season"${lock}>New season</button>
    </div>
    <div class="progress" aria-hidden="true"><span style="width:${(seasonProgress(season) * 100).toFixed(1)}%"></span></div>
  </header>`;
}

export function renderTabs(view: SeasonView): string {
  return `
  <nav class="tabs" role="tablist">
    ${each(TABS, (t) => {
      const active = view.tab === t.id && view.openMatchId === null;
      return `<button type="button" role="tab" aria-selected="${active}" class="${cls('tab', active && 'active')}" data-action="tab" data-tab="${t.id}">${esc(t.label)}</button>`;
    })}
  </nav>`;
}
