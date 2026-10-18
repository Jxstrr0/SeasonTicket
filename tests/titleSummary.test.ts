/** The start-up title screen's copy of the saved career (Stage 7.4). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTitleSummary, storeTitleSummary } from '../src/ui/career/titleSummary';
import { defaultCrest } from '../src/sim/career';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('title summary', () => {
  const summary = { club: 'Lakehaven United', season: 3, crest: defaultCrest({ primary: '#123456', secondary: '#ffffff' }, 'LU') };

  it('round-trips and clears', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    storeTitleSummary(summary);
    expect(loadTitleSummary()).toEqual(summary);
    storeTitleSummary(null);
    expect(loadTitleSummary()).toBeNull();
  });

  it('reads garbled or missing storage as nothing saved', () => {
    const s = fakeStorage();
    vi.stubGlobal('localStorage', s);
    s.setItem('seasonticket.title', '{not json');
    expect(loadTitleSummary()).toBeNull();
    s.setItem('seasonticket.title', JSON.stringify({ club: 4 }));
    expect(loadTitleSummary()).toBeNull();
    vi.stubGlobal('localStorage', undefined);
    expect(loadTitleSummary()).toBeNull();
    expect(() => storeTitleSummary(summary)).not.toThrow();
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
    expect(loadTitleSummary()).toBeNull();
    expect(() => storeTitleSummary(summary)).not.toThrow();
  });
});
