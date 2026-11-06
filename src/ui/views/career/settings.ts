/**
 * Settings: the per-device choices (graphics, sound, tips). They are kept in their own
 * `seasonticket.*` keys, never in the save, so they work with or without a career.
 * `renderDeviceSettings` is shared by the Settings screen (opened from the title screen)
 * and the Settings part of the in-career menu, so the two always match.
 */
import { cls, each, esc } from '../../html';
import type { UiState } from '../../career/state';
import { QUALITY_OPTIONS } from '../../../render/quality';
import { GAME_VERSION } from '../../career/report';

const SLIDERS = [
  { bus: 'crowd', label: 'Crowd', hint: 'the match crowd and the office' },
  { bus: 'effects', label: 'Effects', hint: 'whistle, ball, taps, knocks and the phone' },
  { bus: 'music', label: 'Music', hint: 'the office radio' },
] as const;

/** Mute, the three volume sliders and the office radio. */
export function renderSound(ui: UiState): string {
  const mix = ui.mix;
  return `<div class="card-title">Sound</div>
    <label class="check"><input type="checkbox" data-change="mix-on"${mix.muted ? '' : ' checked'}> Sound on</label>
    ${each(SLIDERS, (s) => {
      const v = Math.round(mix[s.bus] * 100);
      return `<label class="slider${mix.muted ? ' off' : ''}"><span class="slider-name">${esc(s.label)}</span><input type="range" min="0" max="100" step="5" value="${v}" data-change="mix-level" data-bus="${s.bus}" aria-label="${esc(s.label)} volume" aria-valuetext="${v}%"${mix.muted ? ' disabled' : ''}><span class="slider-hint small muted">${esc(s.hint)}</span></label>`;
    })}
    <label class="check"><input type="checkbox" data-change="radio-on"${ui.radio ? ' checked' : ''}> Office radio on</label>
    <p class="muted small">Tap the radio on the office credenza to switch it on or off. On iPhones the ring/silent switch mutes the game.</p>`;
}

/** Graphics, sound and tips: the device settings, the same wherever they are shown. */
export function renderDeviceSettings(ui: UiState): string {
  return `<div class="card-title">Graphics</div>
    <div class="segmented" role="group" aria-label="Graphics quality">
      ${each(QUALITY_OPTIONS, (q) => `<button type="button" class="${cls('seg', q.id === ui.quality && 'on')}" data-action="set-quality" data-quality="${q.id}" aria-pressed="${q.id === ui.quality}">${esc(q.label)}</button>`)}
    </div>
    <p class="muted small">Low runs best on older phones. Off uses the plain menus with no 3D office.</p>
    <label class="check"><input type="checkbox" data-change="show-fps"${ui.showFps ? ' checked' : ''}> Show the frame rate on the 3D match</label>
    ${renderSound(ui)}
    <div class="card-title">Tips</div>
    <label class="check"><input type="checkbox" data-change="tips-on"${ui.tipsOn ? ' checked' : ''}> Show first-time tips</label>
    <div class="menu-row"><button type="button" class="btn-secondary" data-action="tips-reset">Show tips again</button></div>
    <p class="muted small">A short tip the first time you open each screen. Show tips again brings back the ones you've seen.</p>`;
}

/** The Settings screen, opened from the title screen (no career needed). */
export function renderSettings(ui: UiState): string {
  return `<main class="shell settings-screen">
    <header class="help-head">
      <button type="button" class="btn-secondary" data-action="back">Back</button>
      <h1>Settings</h1>
    </header>
    ${ui.flash ? `<p class="${cls('flash', ui.flash.kind === 'error' && 'flash-error')}" role="status">${esc(ui.flash.text)}</p>` : ''}
    <section class="card settings-card">
      ${renderDeviceSettings(ui)}
    </section>
    <p class="muted small center">These settings belong to this device, not to a career, and are kept in this browser.</p>
    <p class="center row-actions title-links">
      <button type="button" class="btn-secondary" data-action="whats-new">What's new</button>
      <button type="button" class="btn-secondary" data-action="credits">Credits</button>
      <button type="button" class="btn-secondary" data-action="back">Back</button>
    </p>
    <p class="center muted small">Season Ticket version ${esc(GAME_VERSION)}, by Longlight Interactive.</p>
  </main>`;
}
