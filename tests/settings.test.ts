/**
 * Settings (1.1.1.0): the device settings sit on their own screen from the title, and the
 * in-career menu shows the same block under a Settings heading, apart from the career options.
 */
import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import { createCareer } from '../src/sim/career';
import { initialUi } from '../src/ui/career/state';
import { renderCareerTitle } from '../src/ui/views/career/title';
import { renderDeviceSettings, renderSettings } from '../src/ui/views/career/settings';
import { renderHub } from '../src/ui/views/career/hub';

const DEVICE_HOOKS = ['data-action="set-quality"', 'data-change="show-fps"', 'data-change="mix-on"', 'data-change="mix-level"', 'data-change="radio-on"', 'data-change="tips-on"', 'data-action="tips-reset"'];

describe('settings', () => {
  it('puts a Settings button on the title screen, with or without a career', () => {
    const ui = initialUi();
    expect(renderCareerTitle(ui.title)).toContain('data-action="settings">Settings<');
  });

  it('shows graphics, sound and tips on the Settings screen, with a way back', () => {
    const html = renderSettings({ ...initialUi(), screen: 'settings' });
    for (const hook of DEVICE_HOOKS) expect(html).toContain(hook);
    expect(html).toContain('<h1>Settings</h1>');
    expect(html).toContain('data-action="back"');
    expect(html).not.toContain('set-mode');
    expect(html).not.toContain('set-pace');
  });

  it('marks the chosen quality and the current switches', () => {
    const html = renderDeviceSettings({ ...initialUi(), quality: 'low', showFps: true, tipsOn: false });
    expect(html).toMatch(/class="seg on"[^>]*data-quality="low"/);
    expect(html).toContain('data-change="show-fps" checked');
    expect(html).not.toContain('data-change="tips-on" checked');
  });

  it('keeps career options in the menu and the device block under Settings', () => {
    const career = createCareer({ seed: 3, teamId: 'crowncaster-city', tier: 'easy', homegrownRule: false });
    const html = renderHub(career, { ...initialUi(), screen: 'hub', menuOpen: true });
    const settingsAt = html.indexOf('>Settings</h2>');
    expect(html.indexOf('>Career</h2>')).toBeGreaterThan(-1);
    expect(settingsAt).toBeGreaterThan(html.indexOf('data-action="set-pace"'));
    expect(settingsAt).toBeGreaterThan(html.indexOf('data-change="auto-lineup"'));
    for (const hook of DEVICE_HOOKS) expect(html.indexOf(hook)).toBeGreaterThan(settingsAt);
  });
});
