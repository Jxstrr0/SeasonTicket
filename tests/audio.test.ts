/**
 * Stage 7.2 sound: the made-in-code sounds, the chants' timing, the mix kept per device
 * (and carried over from the old Off/Low/Medium/High setting) and the menus' sound cues.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SYNTH_KEYS, synth } from '../src/render/audio/synth';
import { busOf } from '../src/render/audio/matchAudio';
import { chantGain, crowdBoost, nextChant } from '../src/ui/career/matchSound';
import { loadMix, loadRadio, storeMix, storeRadio } from '../src/ui/career/state';
import { cuesFor, type CueState } from '../src/ui/career/uiSound';
import { fileSize } from './helpers/node.mjs';
import audio from '../src/data/tuning/audio.json';
import atmosphere from '../src/data/tuning/atmosphere.json';

const RATE = 44100;

describe('made sounds', () => {
  it('are finite, never clip and are the same every time', () => {
    for (const key of [...SYNTH_KEYS, 'room'] as const) {
      const x = synth(key, RATE);
      expect(x.length, key).toBeGreaterThan(RATE * 0.02);
      let peak = 0;
      for (const v of x) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak, key).toBeGreaterThan(0.1);
      expect(peak, key).toBeLessThanOrEqual(1);
      expect(synth(key, RATE)).toEqual(x);
    }
  });

  it('room tone lasts its tuned length and loops without a click', () => {
    const x = synth('room', RATE);
    expect(x.length).toBe(Math.round(audio.office.roomToneS * RATE));
    expect(Math.abs(x[x.length - 1] - x[0])).toBeLessThan(0.05);
  });

  it('every made sound has a gain, and the ring is the longest', () => {
    for (const k of SYNTH_KEYS) expect(audio.ui.gain[k]).toBeGreaterThan(0);
    const lengths = SYNTH_KEYS.map((k) => synth(k, RATE).length);
    expect(Math.max(...lengths)).toBe(synth('ring', RATE).length);
  });
});

describe('sound files', () => {
  it('every file the game asks for is in public/ (the site serves public/ at its root)', () => {
    const paths = [...Object.values(atmosphere.sound.files).flat(), ...audio.radio.tracks];
    let bytes = 0;
    for (const p of paths) {
      const size = fileSize(`public/${p}`);
      expect(size, p).toBeGreaterThan(0);
      bytes += size;
    }
    // All the game's sound together stays small for phones.
    expect(bytes).toBeLessThan(2_700_000);
  });
});

describe('match sound buses', () => {
  it('puts the referee and the ball on effects, the crowd on crowd', () => {
    expect(busOf('whistle')).toBe('effects');
    expect(busOf('kick')).toBe('effects');
    expect(busOf('roar')).toBe('crowd');
    expect(busOf('chant')).toBe('crowd');
    for (const k of atmosphere.sound.effects) expect(atmosphere.sound.files).toHaveProperty(k);
  });
});

describe('chants', () => {
  const C = atmosphere.sound.chants;

  it('come every so often, the same for the same moment', () => {
    let away = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const at = i * 1237;
      const c = nextChant(at, null);
      expect(c.inS).toBeGreaterThanOrEqual(C.everyS[0]);
      expect(c.inS).toBeLessThanOrEqual(C.everyS[1]);
      expect(nextChant(at, null)).toEqual(c);
      if (c.away) away++;
    }
    expect(away / N).toBeGreaterThan(C.awayShare - 0.05);
    expect(away / N).toBeLessThan(C.awayShare + 0.05);
  });

  it('come more often and louder at a derby', () => {
    expect(nextChant(5000, 'derby').inS).toBeCloseTo(nextChant(5000, null).inS * C.derbyEvery, 6);
    expect(nextChant(5000, 'rival').inS).toBe(nextChant(5000, null).inS);
    expect(crowdBoost('derby')).toBeGreaterThan(crowdBoost('rival'));
    expect(crowdBoost('rival')).toBeGreaterThan(crowdBoost(null));
    expect(crowdBoost(null)).toBe(1);
  });

  it('are louder in a fuller ground', () => {
    expect(chantGain(0)).toBe(C.emptyGain);
    expect(chantGain(1)).toBe(1);
    expect(chantGain(0.5)).toBeGreaterThan(chantGain(0.2));
    expect(chantGain(5)).toBe(1);
    expect(chantGain(-1)).toBe(C.emptyGain);
  });
});

describe('sound mix setting', () => {
  const g = globalThis as { localStorage?: unknown };
  const before = g.localStorage;
  afterEach(() => {
    g.localStorage = before;
  });
  const memory = (): Map<string, string> => {
    const store = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    return store;
  };

  it('starts at the default and is kept per device', () => {
    memory();
    expect(loadMix()).toEqual(audio.mix);
    const mix = { muted: true, crowd: 0.2, effects: 0.9, music: 0 };
    storeMix(mix);
    expect(loadMix()).toEqual(mix);
  });

  it('carries the old match sound level over', () => {
    const store = memory();
    store.set('seasonticket.sound', 'low');
    expect(loadMix()).toEqual({ ...audio.mix, crowd: audio.oldLevels.low, effects: audio.oldLevels.low });
    store.set('seasonticket.sound', 'off');
    expect(loadMix()).toEqual({ ...audio.mix, muted: true });
    store.set('seasonticket.sound', 'deafening');
    expect(loadMix()).toEqual(audio.mix);
    // The new setting wins once there is one.
    store.set('seasonticket.audio', JSON.stringify({ muted: false, crowd: 1, effects: 1, music: 1 }));
    expect(loadMix().crowd).toBe(1);
  });

  it('mends a bad record and survives blocked storage', () => {
    const store = memory();
    store.set('seasonticket.audio', JSON.stringify({ muted: 'yes', crowd: 7, effects: 'loud', music: -1 }));
    expect(loadMix()).toEqual({ muted: false, crowd: 1, effects: audio.mix.effects, music: 0 });
    store.set('seasonticket.audio', '{not json');
    expect(loadMix()).toEqual(audio.mix);
    expect(loadRadio()).toBe(false);
    storeRadio(true);
    expect(loadRadio()).toBe(true);
    g.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadMix()).toEqual(audio.mix);
    expect(loadRadio()).toBe(false);
    expect(() => storeMix(audio.mix)).not.toThrow();
    expect(() => storeRadio(true)).not.toThrow();
  });
});

describe('menu sound cues', () => {
  const quiet: CueState = { visitor: false, press: false, bids: 0, calls: 0, news: false };

  it('say nothing on the first render or when nothing changed', () => {
    expect(cuesFor(null, { ...quiet, visitor: true, bids: 3 })).toEqual([]);
    expect(cuesFor(quiet, quiet)).toEqual([]);
    const busy = { visitor: true, press: false, bids: 2, calls: 1, news: true };
    expect(cuesFor(busy, busy)).toEqual([]);
  });

  it('knock for a visitor, ring for an offer or call, page for the paper', () => {
    expect(cuesFor(quiet, { ...quiet, visitor: true })).toEqual(['knock']);
    expect(cuesFor(quiet, { ...quiet, bids: 1 })).toEqual(['ring']);
    expect(cuesFor({ ...quiet, calls: 1 }, { ...quiet, calls: 2 })).toEqual(['ring']);
    expect(cuesFor({ ...quiet, bids: 2 }, { ...quiet, bids: 1 })).toEqual([]);
    expect(cuesFor(quiet, { ...quiet, news: true })).toEqual(['page']);
  });

  it('the press pack gets cameras instead of a knock', () => {
    expect(cuesFor(quiet, { ...quiet, press: true, visitor: true })).toEqual(['cameras']);
    expect(cuesFor({ ...quiet, press: true }, { ...quiet, press: false, visitor: true })).toEqual(['knock']);
  });
});
