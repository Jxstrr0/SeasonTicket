import { afterEach, describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import { C, advanceCareer, createCareer } from '../src/sim/career';
import { decodeSave, freezeSaves, loadCareer, saveCareer, STORAGE_KEY, type SaveStore } from '../src/game/save';
import { buildReport, REPORT_LIMIT } from '../src/ui/career/report';
import { isNoise } from '../src/ui/career/crash';
import VERSION from '../src/data/meta/version.json';

function memoryStore(): SaveStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('the crash safety net', () => {
  afterEach(() => freezeSaves(false));

  it('keeps the last good save when the game breaks half way through a week', () => {
    const club = (C.tiers.normal.clubs as string[])[0];
    const career = createCareer({ seed: 71, teamId: club, tier: 'normal', homegrownRule: false });
    const store = memoryStore();
    expect(saveCareer(career, store)).toBe(true);
    const good = store.getItem(STORAGE_KEY);
    // A week throws part way through: the career in memory is left half-played.
    expect(() => {
      advanceCareer(career);
      (career as { season: unknown }).season = null;
      advanceCareer(career);
    }).toThrow();
    // The crash screen locks the save, so nothing (the autosave when the page hides) overwrites it.
    freezeSaves();
    expect(saveCareer(career, store)).toBe(false);
    expect(store.getItem(STORAGE_KEY)).toBe(good);
    // The kept code is what "Copy save code" offers, and it loads.
    const back = loadCareer(store)!;
    expect(back.weekIndex).toBe(0);
    expect(decodeSave(good!).userTeamId).toBe(club);
  });

  it('writes a short report with the version that fits the contact form', () => {
    const text = buildReport({ where: 'Harbour FC, season 2 week 14', device: 'Test phone, screen 844x390', build: 'abc1234', error: 'TypeError: ' + 'x'.repeat(5000) });
    expect(text).toContain(`Version: ${VERSION.version} (build abc1234)`);
    expect(text).toContain('Career: Harbour FC, season 2 week 14');
    expect(text).toContain('Error: TypeError');
    expect(text.length).toBeLessThan(REPORT_LIMIT / 4);
    expect(buildReport({ where: null, device: 'x' })).toContain('Career: none');
  });

  it('ignores browser noise but not the game breaking', () => {
    expect(isNoise(null, 'Script error.')).toBe(true);
    expect(isNoise(null, 'ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(isNoise(new DOMException('play() was blocked', 'NotAllowedError'))).toBe(true);
    expect(isNoise(new TypeError("Cannot read properties of undefined (reading 'teams')"))).toBe(false);
  });
});
