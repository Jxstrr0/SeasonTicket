/**
 * Match-day atmosphere (Stage 5.5): what the crowd hears and the ticker says, read off a
 * real match, and the settings around it. None of it may change a result.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LineSegments, PerspectiveCamera, Points } from 'three';
import { setupWithBench } from './helpers/spatialFixtures';
import { createSpatial, spatialFinished, stepSpatial } from '../src/sim/spatial/engine';
import type { SpatialMatch } from '../src/sim/spatial/state';
import { describeAt } from '../src/sim/match/commentary';
import { MomentWatch, type Moment } from '../src/ui/career/matchMoments';
import { exciteOf, soundsFor } from '../src/ui/career/matchSound';
import { tickerLine } from '../src/ui/career/ticker';
import { nightMatch } from '../src/ui/career/atmosphere';
import { SOUND_SETTINGS, loadSound, storeSound } from '../src/ui/career/state';
import { buildWeather, weatherLook } from '../src/render/match/weather';
import tuning from '../src/data/tuning/atmosphere.json';

function play(seed: string, watch?: MomentWatch, out?: Moment[]): SpatialMatch {
  const m = createSpatial(setupWithBench(), seed, 'fine');
  watch?.skip(m);
  for (let k = 0; k < 200_000 && !spatialFinished(m); k++) {
    stepSpatial(m);
    watch?.observe(m, out);
  }
  return m;
}

describe('match moments', () => {
  const watch = new MomentWatch();
  const moments: Moment[] = [];
  const m = play('atmo1', watch, moments);
  const of = <K extends Moment['kind']>(kind: K) => moments.filter((x): x is Extract<Moment, { kind: K }> => x.kind === kind);

  it('reports every goal, shot and event once, in order', () => {
    expect(of('goal')).toHaveLength(m.goalLog.length);
    expect(of('shot')).toHaveLength(m.shotLog.filter((s) => s.outcome !== 'goal').length);
    expect(of('event')).toHaveLength(m.events.length);
    for (let i = 1; i < moments.length; i++) expect(moments[i].ms).toBeGreaterThanOrEqual(moments[i - 1].ms);
    const last = of('goal').at(-1);
    if (last) expect(last.score).toEqual([m.score[0], m.score[1]]);
  });

  it('hears the kicks and the kick-offs after goals', () => {
    const kicks = of('kick');
    expect(kicks.length).toBeGreaterThan(300);
    for (const k of kicks) {
      expect(k.power).toBeGreaterThanOrEqual(0);
      expect(k.power).toBeLessThanOrEqual(1);
    }
    // One after each goal. The engine kicks the second half off at the half-time whistle;
    // the screen adds that kick-off's whistle when play comes back on after its break.
    expect(of('kickoff').length).toBe(m.goalLog.length);
  });

  it('whistles play back on after a break, with a line, but says nothing after a goal', () => {
    const half = moments.find((mo) => mo.kind === 'event' && mo.event.kind === 'whistle' && mo.event.note === 'half');
    expect(half).toBeDefined();
    const back: Moment = { kind: 'kickoff', ms: m.clockMs, side: 1, resume: true };
    expect(soundsFor(back)).toEqual([expect.objectContaining({ key: 'whistle' })]);
    const line = tickerLine(m, back);
    expect(line?.text).toMatch(/second half|extra time/i);
    expect(line?.text).not.toMatch(/[{}]/);
    expect(tickerLine(m, { ...back, resume: false })).toBeNull();
  });

  it('never changes the match it watches', () => {
    const plain = play('atmo1');
    expect(plain.score).toEqual(m.score);
    expect(plain.events).toEqual(m.events);
    expect(plain.rng.getState()).toBe(m.rng.getState());
  });

  it('starts again silently on a jump or a different match', () => {
    const w = new MomentWatch();
    w.skip(m);
    expect(w.observe(m)).toEqual([]);
    const other = createSpatial(setupWithBench(), 'atmo2', 'fine');
    expect(w.observe(other)).toEqual([]);
  });

  it('gives the crowd a roar for a home goal and a groan for an away one', () => {
    const at = { ms: 1000, scorer: 9, assist: -1, ownGoal: false, header: false, score: [1, 0] as [number, number] };
    const home = soundsFor({ kind: 'goal', side: 0, ...at });
    expect(home).toEqual([expect.objectContaining({ key: 'roar', goal: true })]);
    const away = soundsFor({ kind: 'goal', side: 1, ...at });
    expect(away.map((c) => c.key)).toEqual(['groan', 'roar']);
    expect(away[1].far).toBe(true);
    for (const mo of moments) {
      const cues = soundsFor(mo);
      expect(soundsFor(mo)).toEqual(cues);
      for (const c of cues) {
        expect(c.ms).toBe(mo.ms);
        expect(tuning.sound.files[c.key]).toBeDefined();
        if (c.pan !== undefined) expect(Math.abs(c.pan)).toBeLessThanOrEqual(tuning.sound.kickPan + 1e-9);
      }
    }
    expect(moments.flatMap(soundsFor).some((c) => c.key === 'whistleEnd')).toBe(true);
    expect(moments.flatMap(soundsFor).some((c) => c.key === 'whistleLong')).toBe(true);
  });

  it('keeps the swell between 0 and 1', () => {
    const u = exciteOf(m);
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThanOrEqual(1);
  });

  it('writes the same ticker lines every time, filled in, with goals standing out', () => {
    const lines = (): ReturnType<typeof tickerLine>[] => moments.map((mo) => tickerLine(m, mo));
    const a = lines();
    expect(lines()).toEqual(a);
    const shown = a.filter((l) => l !== null);
    expect(shown.length).toBeGreaterThan(5);
    for (const l of shown) {
      expect(l.text.length).toBeGreaterThan(5);
      expect(l.text).not.toMatch(/[{}]/);
    }
    expect(a.filter((l, i) => l?.big && moments[i].kind === 'goal')).toHaveLength(m.goalLog.length);
    // Small half-chances get no line.
    const tiny = moments.find((mo) => mo.kind === 'shot' && mo.xg < tuning.ticker.minChanceXg && mo.outcome !== 'post' && !mo.setPiece);
    if (tiny) expect(tickerLine(m, tiny)).toBeNull();
  });
});

describe('commentary lines picked by a number', () => {
  const p = { player: 'Arden', team: 'Lakehaven', score: 'LKH 1-0 DLX', assist: 'Bray' };
  it('maps 0 to the first line and just under 1 to the last, clamping outside', () => {
    expect(describeAt('goal', p, 0)).toBe('GOAL! Arden finishes for Lakehaven. LKH 1-0 DLX.');
    expect(describeAt('goal', p, 0.9999)).toBe('A cool finish from Arden and Lakehaven score. LKH 1-0 DLX.');
    expect(describeAt('goal', p, -3)).toBe(describeAt('goal', p, 0));
    expect(describeAt('goal', p, 7)).toBe(describeAt('goal', p, 0.9999));
  });
  it('skips lines that need a name it does not have', () => {
    for (let u = 0; u < 1; u += 0.05) expect(describeAt('goal', { ...p, assist: '' }, u)).not.toContain('with the pass');
  });
});

describe('evening kick-offs', () => {
  it('lights every playoff and a steady share of league matches', () => {
    expect(nightMatch('anything', true)).toBe(tuning.night.playoffs);
    let n = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (nightMatch(`s1-r${i % 30}-m${i}`, false)) n++;
    expect(n / N).toBeGreaterThan(tuning.night.leagueShare - 0.04);
    expect(n / N).toBeLessThan(tuning.night.leagueShare + 0.04);
    for (let i = 0; i < 50; i++) expect(nightMatch(`id${i}`, false)).toBe(nightMatch(`id${i}`, false));
  });
});

describe('sound setting', () => {
  const g = globalThis as { localStorage?: unknown };
  const before = g.localStorage;
  afterEach(() => {
    g.localStorage = before;
  });

  it('is kept per device and falls back to the default', () => {
    const store = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadSound()).toBe(tuning.sound.defaultLevel);
    for (const s of SOUND_SETTINGS) {
      storeSound(s);
      expect(loadSound()).toBe(s);
    }
    store.set('seasonticket.sound', 'deafening');
    expect(loadSound()).toBe(tuning.sound.defaultLevel);
    g.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSound()).toBe(tuning.sound.defaultLevel);
    expect(() => storeSound('high')).not.toThrow();
    expect(tuning.sound.levels.off).toBe(0);
  });
});

describe('weather on screen', () => {
  it('changes the sky for every weather but a clear day', () => {
    expect(weatherLook('clear')).toBeNull();
    for (const w of ['rain', 'snow', 'wind', 'heat'] as const) expect(weatherLook(w)?.sky).toHaveLength(2);
  });

  it('builds rain as streaks and snow and dust as dots, sized by tier', () => {
    const camera = new PerspectiveCamera(40, 2, 1, 1000);
    for (const [kind, Kind, per] of [
      ['rain', LineSegments, 2],
      ['snow', Points, 1],
      ['wind', Points, 1],
    ] as const) {
      const counts = tuning.weather[kind].count;
      for (const tier of ['low', 'medium', 'high'] as const) {
        const view = buildWeather(kind, tier);
        const fall = view.root.children.find((c) => c instanceof Kind) as LineSegments | Points;
        expect(fall).toBeDefined();
        expect(fall.geometry.getAttribute('aSeed').count).toBe(counts[tier] * per);
        expect(view.tick(1 / 30, camera, 780)).toBe(true);
        view.dispose();
      }
      expect(counts.low).toBeLessThan(counts.medium);
      expect(counts.medium).toBeLessThan(counts.high);
    }
    const heat = buildWeather('heat', 'medium');
    expect(heat.root.children.some((c) => c instanceof Points || c instanceof LineSegments)).toBe(false);
    heat.dispose();
  });
});
