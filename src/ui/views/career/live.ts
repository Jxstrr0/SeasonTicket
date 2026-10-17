/**
 * The live match: score and clock, the 2D pitch (src/ui/career/liveHost.ts
 * fills its slot), play/pause and speed, the pause banner for big moments,
 * and the subs and tactics panels. Everything here reads
 * career.liveMatch; the owner's changes go through src/game/matchday.ts.
 */
import type { Career } from '../../../sim/career';
import { MATCH_TUNING } from '../../../sim/data';
import type { MatchState, SideState } from '../../../sim/match/state';
import type { Player } from '../../../sim/types';
import { coachInCharge, injuredOnPitch, userSide } from '../../../game/matchday';
import { clubLabel, kit, team, weatherLabel } from '../../format';
import { cls, each, esc } from '../../html';
import { LIVE_SPEEDS, PITCH_SPEEDS, type UiState } from '../../career/state';
import { renderEvent, renderStat, statRows, visibleEvents } from '../matchFeed';
import { renderFormationPicker, renderTacticsPanel } from './lineup';
import { confirmButton } from './parts';

const PERIOD_TEXT: Record<MatchState['period'], string> = {
  firstHalf: 'First half',
  secondHalf: 'Second half',
  etFirstHalf: 'Extra time',
  etSecondHalf: 'Extra time',
  shootout: 'Penalties',
  finished: 'Full time',
};

function clock(state: MatchState): string {
  if (state.finished) return 'FT';
  if (state.period === 'shootout') return 'Pens';
  if (state.minute === 0) return "0'";
  return state.added > 0 ? `${state.minute}+${state.added}'` : `${state.minute}'`;
}

function players(career: Career, ids: readonly string[]): Player[] {
  const all = career.season.league.players;
  return ids.filter((id) => id !== '').map((id) => all[id]).filter((p): p is Player => !!p);
}

function energy(S: SideState, id: string): string {
  const e = Math.round((S.fatigue[id] ?? 1) * 100);
  const band = e >= 75 ? 'good' : e >= 55 ? 'ok' : 'low';
  return `<span class="${cls('energy', `energy-${band}`)}" title="Energy">${e}%</span>`;
}

function renderScoreboard(career: Career, state: MatchState): string {
  const league = career.season.league;
  const home = team(league, state.setup.homeId);
  const away = team(league, state.setup.awayId);
  const pens = state.shootout ? `<div class="small">Penalties ${state.shootout.home}-${state.shootout.away}</div>` : '';
  return `<section class="card scoreboard">
    <div class="sb-side home">${kit(home)}<span class="sb-name">${clubLabel(home)}</span></div>
    <div class="sb-mid">
      <div class="sb-score">${state.homeScore}-${state.awayScore}</div>
      <div class="sb-clock">${esc(clock(state))}</div>
      ${pens}
    </div>
    <div class="sb-side away"><span class="sb-name">${clubLabel(away)}</span>${kit(away)}</div>
    <div class="sb-meta muted small">${esc(PERIOD_TEXT[state.period])} · ${esc(weatherLabel(state.setup.weather))}</div>
  </section>`;
}

function renderControls(career: Career, ui: UiState, state: MatchState): string {
  if (state.finished) {
    return `<section class="card notice">
      <p><strong>Full time.</strong> Head back to the office for the report.</p>
      <button type="button" data-action="live-continue">Continue</button>
    </section>`;
  }
  const live = ui.live;
  const full = career.delegation.matchMode === 'full';
  const coach = coachInCharge(career);
  const coachToggle = full
    ? `<button type="button" class="${cls('btn-secondary', coach && 'on')}" data-action="live-coach" aria-pressed="${coach}">${coach ? 'Coach in charge' : 'Hand to coach'}</button>`
    : '<span class="muted small">The coach handles the rest; you make the big calls.</span>';
  const pause = live.pause
    ? `<div class="pause-banner" role="status"><strong>${esc(live.pause)}</strong><span class="muted small">Make a change or play on.</span></div>`
    : '';
  const speeds = live.pitch
    ? each(PITCH_SPEEDS, (s) => `<button type="button" class="${cls('seg', s.x === live.pitchSpeed && 'on')}" data-action="live-pitch-speed" data-x="${s.x}" aria-pressed="${s.x === live.pitchSpeed}">${esc(s.label)}</button>`)
    : each(LIVE_SPEEDS, (s) => `<button type="button" class="${cls('seg', s.ms === live.speed && 'on')}" data-action="live-speed" data-ms="${s.ms}" aria-pressed="${s.ms === live.speed}">${esc(s.label)}</button>`);
  return `${pause}
  <div class="live-controls">
    <button type="button" class="play-btn" data-action="${live.running ? 'live-pause' : 'live-play'}">${live.running ? 'Pause' : 'Play'}</button>
    <div class="segmented" role="group" aria-label="Speed">${speeds}</div>
    <button type="button" class="${cls('btn-secondary', live.pitch && 'on')}" data-action="live-pitch" aria-pressed="${live.pitch}">Pitch</button>
    ${live.pitch && ui.quality !== 'off' && !ui.match3dFailed ? `<button type="button" class="${cls('btn-secondary', ui.match3d && 'on')}" data-action="match-3d" aria-pressed="${ui.match3d}">3D</button>` : ''}
    ${live.pitch && ui.quality !== 'off' && !ui.match3dFailed && ui.match3d ? `<button type="button" class="${cls('btn-secondary', ui.highlights && 'on')}" data-action="match-highlights" aria-pressed="${ui.highlights}" aria-label="Highlights: 3D for the big moments only">Highlights</button>` : ''}
    ${coachToggle}
    ${confirmButton(ui, 'live-skip', 'end', 'Skip to the end')}
    <button type="button" class="btn-secondary" data-action="live-leave">Office</button>
  </div>`;
}

function renderPanelTabs(ui: UiState, state: MatchState, S: SideState): string {
  const p = ui.live.panel;
  const left = MATCH_TUNING.squad.maxSubs - S.subsUsed;
  const locked = state.finished || state.period === 'shootout';
  return `<div class="segmented" role="group" aria-label="Changes">
    <button type="button" class="${cls('seg', p === 'subs' && 'on')}" data-action="live-panel" data-panel="${p === 'subs' ? 'none' : 'subs'}" aria-pressed="${p === 'subs'}"${locked ? ' disabled' : ''}>Subs · ${left} left</button>
    <button type="button" class="${cls('seg', p === 'tactics' && 'on')}" data-action="live-panel" data-panel="${p === 'tactics' ? 'none' : 'tactics'}" aria-pressed="${p === 'tactics'}"${locked ? ' disabled' : ''}>Tactics</button>
  </div>`;
}

function renderSubs(career: Career, ui: UiState, S: SideState): string {
  const hurt = new Set(injuredOnPitch(career));
  const outId = ui.live.subOut;
  const left = MATCH_TUNING.squad.maxSubs - S.subsUsed;
  if (left <= 0) return '<section class="card"><p class="muted">All substitutions used.</p></section>';
  const onPitch = players(career, S.onPitch);
  const used = new Set(Object.keys(S.playerStats).filter((id) => !S.onPitch.includes(id)));
  const bench = players(career, S.bench).filter((p) => !used.has(p.id) && !S.sentOff.includes(p.id));
  return `<section class="card">
    <div class="card-title">${outId ? 'Who comes on?' : 'Who comes off?'}</div>
    <div class="sub-grid">
      <ul class="pick-list">${each(onPitch, (p) => `<li><button type="button" class="${cls('pick', p.id === outId && 'on')}" data-action="live-sub-out" data-id="${p.id === outId ? '' : esc(p.id)}">
        <span class="pick-name">${esc(p.lastName)}${hurt.has(p.id) ? ' <span class="flag flag-injury">Hurt</span>' : ''}${(S.yellows[p.id] ?? 0) > 0 ? ' <span class="flag flag-yellow">Y</span>' : ''}</span>
        <span class="muted small">${esc(p.position)} ${p.overall}</span>
        ${energy(S, p.id)}
      </button></li>`)}</ul>
      <ul class="pick-list">${bench.length ? each(bench, (p) => `<li><button type="button" class="pick" data-action="live-sub-in" data-id="${esc(p.id)}"${outId ? '' : ' disabled'}>
        <span class="pick-name">${esc(p.lastName)}</span>
        <span class="muted small">${esc(p.position)} ${p.overall}</span>
      </button></li>`) : '<li class="muted small">Nobody left on the bench.</li>'}</ul>
    </div>
    <p class="muted small">${outId ? 'Now tap a bench player.' : 'Tap a player on the pitch, then the one coming on.'}</p>
  </section>`;
}

function renderLiveTactics(career: Career, ui: UiState, state: MatchState, S: SideState): string {
  const opp = userSide(career, state) === 'home' ? state.away : state.home;
  return `<section class="card">
    <div class="card-title">Formation</div>
    ${renderFormationPicker(S.tactics.formationId, false)}
    ${renderTacticsPanel(S.tactics, { disabled: false, takers: players(career, S.onPitch), opponents: players(career, opp.onPitch) })}
    <p class="muted small">${ui.live.pitch ? 'Changes take effect as soon as play restarts: watch the shape move on the pitch.' : 'Changes take effect from the next minute.'}</p>
  </section>`;
}

function renderStats(state: MatchState): string {
  if (state.minute === 0) return '';
  return `<section class="card"><div class="stats-strip">${each(statRows(state.home.stats, state.away.stats), renderStat)}</div></section>`;
}

function renderEvents(career: Career, ui: UiState, state: MatchState): string {
  const events = visibleEvents(state.events, ui.live.showAll).slice().reverse();
  return `<section class="card">
    <div class="feed-controls">
      <h2 class="feed-title">${ui.live.showAll ? 'Every event' : 'Key moments'}</h2>
      <button type="button" class="btn-secondary" data-action="live-toggle-events" aria-pressed="${ui.live.showAll}">${ui.live.showAll ? 'Key moments only' : 'Show all'}</button>
    </div>
    ${events.length ? `<ol class="events">${each(events, (e) => renderEvent(career.season.league, e))}</ol>` : '<p class="muted small">Kick-off is waiting on you. Tap Play.</p>'}
  </section>`;
}

export function renderLive(career: Career, ui: UiState): string {
  const state = career.liveMatch;
  if (!state) {
    return `<main class="shell"><section class="card"><p class="muted">No match is on.</p><button type="button" data-action="live-continue">Back to the office</button></section></main>`;
  }
  const S = userSide(career, state) === 'home' ? state.home : state.away;
  const panel = state.finished ? 'none' : ui.live.panel;
  const rest = `${renderControls(career, ui, state)}
    ${state.finished ? '' : renderPanelTabs(ui, state, S)}
    <div class="live-grid">
      <div>
        ${panel === 'subs' ? renderSubs(career, ui, S) : ''}
        ${panel === 'tactics' ? renderLiveTactics(career, ui, state, S) : ''}
        ${renderStats(state)}
      </div>
      <div>${renderEvents(career, ui, state)}</div>
    </div>`;
  if (!ui.live.pitch) {
    return `<main class="shell live">
    ${renderScoreboard(career, state)}
    ${rest}
  </main>`;
  }
  // Landscape: the pitch fills the left, everything else scrolls on the right.
  return `<main class="shell live has-pitch">
    <div class="lp-col">
      ${renderScoreboard(career, state)}
      <div data-slot="live-2d"></div>
    </div>
    <div class="lp-rest">${rest}</div>
  </main>`;
}
