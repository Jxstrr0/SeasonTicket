/**
 * Spatial match engine, build step 2: shape and movement with a scripted ball.
 * Checks the deterministic maths, the ban on platform maths, ball flight, team shape,
 * tactic responses, determinism and replay, and the time budgets (docs/DESIGN.md 17.11).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { simulateFlight } from '../src/sim/spatial/ball';
import { PI, detAtan, detAtan2, detCos, detExp, detLog, detPow, detSin, powInt, sCurve } from '../src/sim/spatial/det';
import {
  captureFrame, createSpatial, fingerprint, freezeBall, markingPair, playerRole, pressingPlayers,
  queueTactics, replayFrames, runSeconds, spatialRecord, stepSpatial, teamShapeInfo,
} from '../src/sim/spatial/engine';
import { LENGTH, N, WIDTH, depthOf, type SpatialMatch } from '../src/sim/spatial/state';
import { FRAME_VALUES, ROLE, type Side, type SpatialMode, type SpatialSetup } from '../src/sim/spatial/types';
import type { Dial, Tactics } from '../src/sim/types';
import { bundleAndImport, countGcs, envFlag, listSources, readSource } from './helpers/node.mjs';
import { setup, tactics } from './helpers/spatialFixtures';

function relErr(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
}

// ---------------------------------------------------------------------------
// Deterministic maths
// ---------------------------------------------------------------------------

describe('spatial deterministic maths', () => {
  it('exp and log match the built-ins to about 15 digits', () => {
    for (let x = -30; x <= 30; x += 0.37) expect(relErr(detExp(x), Math.exp(x))).toBeLessThan(1e-13);
    for (const x of [1e-9, 1e-4, 0.01, 0.3, 0.7071, 1, 1.4142, 2, 3.5, 10, 100, 12345.678, 1e9]) {
      expect(Math.abs(detLog(x) - Math.log(x))).toBeLessThan(1e-13 * Math.max(1, Math.abs(Math.log(x))));
    }
    expect(detLog(1)).toBe(0);
  });

  it('sin, cos and atan match the built-ins over the ranges the engine uses', () => {
    for (let x = -7; x <= 7; x += 0.013) {
      expect(Math.abs(detSin(x) - Math.sin(x))).toBeLessThan(1e-14);
      expect(Math.abs(detCos(x) - Math.cos(x))).toBeLessThan(1e-14);
    }
    for (let x = -50; x <= 50; x += 0.071) expect(Math.abs(detAtan(x) - Math.atan(x))).toBeLessThan(1e-14);
    for (const [y, x] of [[1, 1], [1, -1], [-1, -1], [-1, 1], [0, 1], [0, -1], [3, 0], [-3, 0], [0.2, -7]]) {
      expect(Math.abs(detAtan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-14);
    }
    expect(PI).toBe(Math.PI);
  });

  it('pow, whole-number powers and the S-curve behave', () => {
    for (const [a, b] of [[2, 0.5], [10, 1.7], [0.3, 2.2], [65, 1.25], [1.01, 300]]) {
      expect(relErr(detPow(a, b), Math.pow(a, b))).toBeLessThan(1e-13);
    }
    expect(powInt(1.1, 3)).toBe(1.1 * 1.1 * 1.1);
    expect(powInt(2, -2)).toBe(0.25);
    expect(sCurve(0)).toBe(0.5);
    let prev = -Infinity;
    for (let x = -20; x <= 20; x += 0.25) {
      const v = sCurve(x);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
      prev = v;
    }
  });
});

// ---------------------------------------------------------------------------
// No platform maths in engine code (this test is the lint rule; there is no ESLint)
// ---------------------------------------------------------------------------

describe('spatial engine uses only deterministic maths', () => {
  const BANNED = /Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|sinh|cosh|tanh|cbrt|random)\b|\*\*/;

  function code(path: string): string {
    return readSource(path)
      .replace(/\/\/ det:allow-begin[\s\S]*?\/\/ det:allow-end/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
  }

  const spatialFiles = listSources('src/sim/spatial');
  const shared = ['src/sim/match/clock.ts', 'src/sim/match/strength.ts', 'src/sim/match/ratings.ts', 'src/sim/rng.ts'];

  it.each([...spatialFiles, ...shared])('%s has no banned maths', (path) => {
    const lines = code(path).split('\n').filter((l) => BANNED.test(l));
    expect(lines).toEqual([]);
  });

  it('spatial code never uses the platform-maths normal()', () => {
    for (const path of spatialFiles) {
      const src = code(path);
      expect(src).not.toMatch(/\.normal\(|normalClamped/);
      expect(src).not.toMatch(/from 'three'|document\.|window\./);
    }
  });
});

// ---------------------------------------------------------------------------
// Ball flight
// ---------------------------------------------------------------------------

describe('spatial ball flight', () => {
  const carry = (speed: number, deg: number) => {
    const a = (deg * PI) / 180;
    return simulateFlight(speed, detCos(a), detSin(a), 0.1);
  };

  it('lofted kicks carry believable distances', () => {
    // Measured: 24 m/s at 35 deg carries about 38 m, 30 m/s about 52 m, 33 m/s at 40 deg about 60 m.
    expect(carry(24, 35).carry).toBeGreaterThan(34);
    expect(carry(24, 35).carry).toBeLessThan(44);
    expect(carry(30, 35).carry).toBeGreaterThan(46);
    expect(carry(30, 35).carry).toBeLessThan(58);
    expect(carry(33, 40).carry).toBeGreaterThan(52);
    expect(carry(33, 40).carry).toBeLessThan(66);
    expect(carry(30, 35).time).toBeGreaterThan(2.4);
    expect(carry(30, 35).time).toBeLessThan(3.4);
  });

  it('carry grows with launch speed', () => {
    let prev = 0;
    for (let v = 10; v <= 40; v += 1) {
      const c = carry(v, 35).carry;
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });
});

// ---------------------------------------------------------------------------
// Team shape (ball pinned in place so only the tactics move players)
// ---------------------------------------------------------------------------

function pinned(home: Partial<Tactics>, ballX: number, possSide: Side, seconds = 15): SpatialMatch {
  const m = createSpatial(setup(home), 'shape', 'fine');
  freezeBall(m, ballX, 34, possSide);
  runSeconds(m, seconds);
  return m;
}

/** Depths of the home outfielders, in slot order. */
function homeDepths(m: SpatialMatch): number[] {
  const out: number[] = [];
  for (let s = 1; s < 11; s++) out.push(depthOf(0, m.px[s]));
  return out;
}

describe('spatial team shape', () => {
  it('the defensive line dial moves the back line out of possession', () => {
    // Ball deep in the opponents' half with them on it: the block sits off the ball.
    const low = teamShapeInfo(pinned({ defensiveLine: 1 }, 72, 1), 0);
    const high = teamShapeInfo(pinned({ defensiveLine: 5 }, 72, 1), 0);
    expect(low.backLine).toBeGreaterThan(29);
    expect(low.backLine).toBeLessThan(35);
    expect(high.backLine).toBeGreaterThan(53);
    expect(high.backLine).toBeLessThan(59);
    expect(high.backLine - low.backLine).toBeGreaterThanOrEqual(20);
  });

  it('a four-man back line stays flat out of possession', () => {
    const m = pinned({ defensiveLine: 3 }, 72, 1);
    const d = homeDepths(m);
    const deepest = Math.min(...d);
    expect(d.filter((x) => x - deepest <= 4).length).toBeGreaterThanOrEqual(4);
    const info = teamShapeInfo(m, 0);
    expect(info.length).toBeGreaterThan(24);
    expect(info.length).toBeLessThan(36);
  });

  it('the line drops to the edge of the box when the ball is near goal', () => {
    for (const line of [1, 3, 5] as Dial[]) {
      const info = teamShapeInfo(pinned({ defensiveLine: line }, 20, 1), 0);
      expect(info.backLine).toBeGreaterThan(11);
      expect(info.backLine).toBeLessThan(15);
    }
  });

  it('in possession the full-backs push on and the centre-backs hold', () => {
    const m = pinned({ defensiveLine: 3 }, 57, 0);
    const d = homeDepths(m);
    const deepest = Math.min(...d);
    const atBack = d.filter((x) => x - deepest <= 4).length;
    expect(atBack).toBeGreaterThanOrEqual(2);
    expect(atBack).toBeLessThanOrEqual(3);
    // Full-backs (slots 1 and 4) well ahead of the centre-backs (slots 2 and 3).
    expect(d[0] - d[1]).toBeGreaterThan(8);
    expect(d[3] - d[2]).toBeGreaterThan(8);
  });

  it('the width dial spreads the team in possession', () => {
    const narrow = teamShapeInfo(pinned({ width: 1 }, 57, 0), 0);
    const wide = teamShapeInfo(pinned({ width: 5 }, 57, 0), 0);
    expect(narrow.width).toBeGreaterThan(38);
    expect(narrow.width).toBeLessThan(46);
    expect(wide.width).toBeGreaterThan(58);
    expect(wide.width - narrow.width).toBeGreaterThan(15);
    // Out of possession the block keeps its compact width.
    const out = teamShapeInfo(pinned({ width: 5 }, 72, 1), 0);
    expect(out.width).toBeLessThan(42);
  });

  it('a tactics change reaches the shape within seconds', () => {
    const m = createSpatial(setup({ defensiveLine: 1 }), 'respond', 'fine');
    freezeBall(m, 72, 34, 1);
    runSeconds(m, 12);
    const before = teamShapeInfo(m, 0);
    const action = queueTactics(m, 0, tactics({ defensiveLine: 5 }));
    expect(action.ms).toBe(13000);
    runSeconds(m, 1.2); // the change applies at 13.0 s
    const target = teamShapeInfo(m, 0);
    expect(target.targetLine - before.targetLine).toBeGreaterThanOrEqual(20);
    runSeconds(m, 1.8); // three seconds after the change
    const moving = teamShapeInfo(m, 0);
    expect(moving.backLine - before.backLine).toBeGreaterThanOrEqual(4);
    runSeconds(m, 12);
    const settled = teamShapeInfo(m, 0);
    expect(Math.abs(settled.backLine - settled.targetLine)).toBeLessThan(2);
  });
});

// ---------------------------------------------------------------------------
// Pressing, counters and man-marking with the scripted ball
// ---------------------------------------------------------------------------

interface Behaviour {
  pressShare: number;
  pressersPerStep: number;
  counterSteps: number;
  markSteps: number;
  markDist: number;
}

function behaviour(home: Partial<Tactics>, seed: string, minutes = 20): Behaviour {
  const m = createSpatial(setup(home), seed, 'fine');
  let oppSteps = 0, pressSteps = 0, pressers = 0, counterSteps = 0, markSteps = 0, markDist = 0;
  while (m.clockMs < minutes * 60000 && stepSpatial(m)) {
    if (m.poss === 1) {
      oppSteps++;
      const p = pressingPlayers(m, 0);
      if (p.length > 0) { pressSteps++; pressers += p.length; }
      const pair = markingPair(m, 0);
      if (pair) {
        markSteps++;
        const dx = m.px[pair[0]] - m.px[pair[1]];
        const dy = m.py[pair[0]] - m.py[pair[1]];
        markDist += Math.sqrt(dx * dx + dy * dy);
      }
    }
    for (let i = 1; i < 11; i++) if (playerRole(m, i) === ROLE.COUNTER) { counterSteps++; break; }
  }
  return {
    pressShare: pressSteps / oppSteps,
    pressersPerStep: pressers / oppSteps,
    counterSteps,
    markSteps,
    markDist: markSteps > 0 ? markDist / markSteps : Infinity,
  };
}

describe('spatial pressing, counters and marking', () => {
  it('the pressing dial changes how often and how many players press', () => {
    const low = behaviour({ pressing: 1 }, 'press');
    const mid = behaviour({ pressing: 3 }, 'press');
    const high = behaviour({ pressing: 5 }, 'press');
    expect(low.pressShare).toBeLessThan(0.1);
    expect(mid.pressShare).toBeGreaterThan(0.25);
    expect(high.pressShare).toBeGreaterThan(0.45);
    expect(high.pressersPerStep).toBeGreaterThan(3 * mid.pressersPerStep);
  });

  it('counter-attack runners go only when counters are switched on', () => {
    expect(behaviour({ counterAttack: false }, 'counter').counterSteps).toBe(0);
    expect(behaviour({ counterAttack: true }, 'counter').counterSteps).toBeGreaterThan(500);
  });

  it('a man-marker stays tight to his target', () => {
    expect(behaviour({}, 'mark').markSteps).toBe(0);
    const b = behaviour({ manMarkTarget: 'away-9' }, 'mark');
    expect(b.markSteps).toBeGreaterThan(2000);
    expect(b.markDist).toBeLessThan(3);
  });
});

// ---------------------------------------------------------------------------
// Determinism and replay
// ---------------------------------------------------------------------------

function fingerprintAfter(s: SpatialSetup, seed: string, mode: SpatialMode, minutes: number): string {
  const m = createSpatial(s, seed, mode);
  while (m.clockMs < minutes * 60000 && stepSpatial(m)) { /* run */ }
  return fingerprint(m);
}

describe('spatial determinism', () => {
  it.each(['fine', 'coarse'] as SpatialMode[])('the same seed gives the same match (%s)', (mode) => {
    const a = fingerprintAfter(setup(), 'same-seed', mode, 10);
    const b = fingerprintAfter(setup(), 'same-seed', mode, 10);
    const c = fingerprintAfter(setup(), 'other-seed', mode, 10);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('a replay from the record matches the live match frame for frame', () => {
    const live = createSpatial(setup(), 'replay', 'fine');
    runSeconds(live, 30);
    queueTactics(live, 0, tactics({ defensiveLine: 5, pressing: 5, width: 5 }));
    const frames: Int16Array[] = [];
    while (live.clockMs < 50000) {
      if (live.clockMs >= 40000) {
        const f = new Int16Array(FRAME_VALUES);
        captureFrame(live, f);
        frames.push(f);
      }
      stepSpatial(live);
    }
    const record = JSON.parse(JSON.stringify(spatialRecord(live)));
    const replay = replayFrames(record, 40, 50);
    expect(replay.length).toBe(frames.length * FRAME_VALUES);
    for (let k = 0; k < frames.length; k++) {
      expect(Array.from(replay.subarray(k * FRAME_VALUES, (k + 1) * FRAME_VALUES))).toEqual(Array.from(frames[k]));
    }
  });
});

// ---------------------------------------------------------------------------
// Sanity over a whole match
// ---------------------------------------------------------------------------

describe('spatial match sanity', () => {
  it.each(['fine', 'coarse'] as SpatialMode[])('a full %s match stays on the pitch with sane distances', (mode) => {
    const m = createSpatial(setup(), 'sanity', mode);
    let bad = 0;
    while (stepSpatial(m)) {
      for (let i = 0; i < N; i++) {
        const x = m.px[i], y = m.py[i];
        if (!(x >= 0 && x <= LENGTH && y >= 0 && y <= WIDTH)) bad++;
      }
      if (!Number.isFinite(m.ball.x) || !Number.isFinite(m.ball.y) || !Number.isFinite(m.ball.z)) bad++;
    }
    expect(bad).toBe(0);
    expect(m.clockMs).toBeGreaterThanOrEqual(5_400_000);
    // Without stoppages yet (step 5) outfielders run about 14 km (coarse a little more);
    // real matches are 9 to 13. Tighten this once dead-ball time exists.
    for (let i = 0; i < N; i++) {
      const km = m.dist[i] / 1000;
      if (i % 11 === 0) { expect(km).toBeLessThan(8); continue; }
      expect(km).toBeGreaterThan(8);
      expect(km).toBeLessThan(16.5);
    }
  });
});

// ---------------------------------------------------------------------------
// Time budgets (DESIGN.md 17.11). The engine is bundled and imported natively:
// vitest's module transform makes hot loops several times slower than real builds.
// ---------------------------------------------------------------------------

describe('spatial benchmarks', () => {
  type Bench = typeof import('./bench/spatialBench');
  let loaded: { mod: Bench; cleanup: () => void } | null = null;
  async function load(): Promise<Bench> {
    if (!loaded) loaded = await bundleAndImport<Bench>('tests/bench/spatialBench.ts');
    return loaded.mod;
  }
  afterAll(() => loaded?.cleanup());

  const time = (fn: () => void): number => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };

  it('fine match, league week and season fit their budgets', async () => {
    const b = await load();
    const s = setup();
    // Warm up the JIT the way a long session would.
    b.playMinutes(s, 'warm', 'fine', 20);
    b.playMinutes(s, 'warm', 'coarse', 45);

    const full = envFlag('BENCH_FULL');
    const fine = time(() => b.playMatch(s, 'bench-fine', 'fine'));
    const week = time(() => { for (let k = 0; k < 8; k++) b.playMatch(s, `bench-week-${k}`, 'coarse'); });
    const seasonMatches = 245;
    const season = full
      ? time(() => { for (let k = 0; k < seasonMatches; k++) b.playMatch(s, `bench-season-${k}`, 'coarse'); })
      : (week / 8) * seasonMatches;
    console.log(
      `[spatial bench] fine match ${fine.toFixed(0)} ms (budget 750), ` +
      `league week ${week.toFixed(0)} ms (budget 1000), ` +
      `season ${(season / 1000).toFixed(1)} s ${full ? 'measured' : 'estimated'} (budget 31)`,
    );
    expect(fine).toBeLessThan(750);
    expect(week).toBeLessThan(1000);
    expect(season).toBeLessThan(31_000);
  }, 120_000);

  it('a fine match causes few garbage collections', async () => {
    const b = await load();
    const s = setup();
    b.playMinutes(s, 'warm-gc', 'fine', 10);
    const gcs = await countGcs(() => b.playMatch(s, 'bench-gc', 'fine'));
    console.log(`[spatial bench] garbage collections in one fine match: ${gcs} (budget 20)`);
    expect(gcs).toBeLessThanOrEqual(20);
  }, 60_000);
});
