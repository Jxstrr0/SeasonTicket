/**
 * Spatial match engine, build steps 2 to 4: shape and movement, passing and possession, then
 * attacking and shooting. Checks the deterministic maths, the ban on platform maths, ball
 * flight, team shape, tactic responses, determinism and replay, whole-match sanity, that
 * possession, passing, shots and goals look believable, and the stand-in restarts. The time
 * budgets are in tests/perf (docs/DESIGN.md 17.11).
 */
import { describe, expect, it } from 'vitest';
import { simulateFlight } from '../src/sim/spatial/ball';
import { SPATIAL_TUNING } from '../src/sim/data';
import { PI, detAtan, detAtan2, detCos, detExp, detLog, detPow, detSin, powInt, sCurve } from '../src/sim/spatial/det';
import {
  captureFrame, createSpatial, fingerprint, freezeBall, markingPair, playerRole, pressingPlayers,
  matchStats, queueTactics, replayFrames, runSeconds, spatialRecord, stepSpatial, teamShapeInfo,
  type SideStats,
} from '../src/sim/spatial/engine';
import { inAttackBox, xgFrom } from '../src/sim/spatial/shot';
import {
  BALL_DEAD, LENGTH, N, RESTART_KICKOFF, RESTART_NONE, RESTART_THROW_IN, WIDTH, depthOf, sideOf, type SpatialMatch,
} from '../src/sim/spatial/state';
import { FRAME_VALUES, ROLE, type Side, type SpatialMode, type SpatialSetup, type SpatialSide } from '../src/sim/spatial/types';
import type { Dial, Tactics } from '../src/sim/types';
import { listSources, readSource } from './helpers/node.mjs';
import { setup, side, tactics } from './helpers/spatialFixtures';

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
// Pressing, counters and man-marking in open play
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
  let lostAt = 0, lastPoss = m.poss;
  while (m.clockMs < minutes * 60000 && stepSpatial(m)) {
    if (m.poss !== lastPoss) { lastPoss = m.poss; lostAt = m.clockMs; }
    // Open play only, away from our own goal, where the ball is always closed down.
    if (m.poss === 1 && m.ball.state !== BALL_DEAD && m.ball.x > SPATIAL_TUNING.press.dangerZone) {
      oppSteps++;
      const p = pressingPlayers(m, 0);
      if (p.length > 0) { pressSteps++; pressers += p.length; }
      // Once he has had a couple of seconds to get back to his man after losing the ball.
      const pair = m.clockMs - lostAt >= 2000 ? markingPair(m, 0) : null;
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
    // Outfielders still run about 13 km on average, the busiest about 16.5; real matches are
    // 9 to 13. Fatigue and the tuning pass (build steps 6 and 7) bring this down; tighten it then.
    for (let i = 0; i < N; i++) {
      const km = m.dist[i] / 1000;
      if (i % 11 === 0) { expect(km).toBeLessThan(8); continue; }
      expect(km).toBeGreaterThan(8);
      expect(km).toBeLessThan(17.5);
    }
  });
});

// ---------------------------------------------------------------------------
// Passing and possession (docs/STAGE_4_5_SPATIAL_ENGINE.md: believability targets)
// ---------------------------------------------------------------------------

interface Totals { possession: number; passes: number; completed: number; matches: number }

/** Totals for each side over a few whole matches. */
function season(s: SpatialSetup, seed: string, mode: SpatialMode, matches: number): [Totals, Totals, SideStats[][]] {
  const t: [Totals, Totals] = [
    { possession: 0, passes: 0, completed: 0, matches },
    { possession: 0, passes: 0, completed: 0, matches },
  ];
  const each: SideStats[][] = [];
  for (let k = 0; k < matches; k++) {
    const m = createSpatial(s, `${seed}-${k}`, mode);
    while (stepSpatial(m)) { /* play the match */ }
    const st = matchStats(m);
    each.push(st);
    for (const q of [0, 1] as const) {
      t[q].possession += st[q].possession / matches;
      t[q].passes += st[q].passes;
      t[q].completed += st[q].completed;
    }
  }
  return [t[0], t[1], each];
}

const completion = (t: Totals): number => t.completed / t.passes;

describe('spatial passing and possession', () => {
  it.each([['fine', 1], ['coarse', 3]] as [SpatialMode, number][])(
    'even sides share the ball and pass believably (%s)',
    (mode, matches) => {
      const [, , each] = season(setup(), 'even', mode, matches);
      for (const st of each) {
        for (const q of [0, 1]) {
          expect(st[q].possession).toBeGreaterThan(0.35);
          expect(st[q].possession).toBeLessThan(0.65);
          expect(st[q].completion).toBeGreaterThan(0.7);
          expect(st[q].completion).toBeLessThan(0.88);
        }
        // Real matches have about 10 a minute; ours run high (about 15 fine, 12 coarse, where
        // dead balls take longer). The tuning pass (build step 7) brings this down.
        const perMinute = (st[0].passes + st[1].passes) / 90;
        expect(perMinute).toBeGreaterThan(9);
        expect(perMinute).toBeLessThan(19);
      }
    },
  );

  it('the better side keeps more of the ball and completes more passes', () => {
    const s = { home: side('home', tactics(), 70), away: side('away', tactics(), 60) };
    const [strong, weak, each] = season(s, 'strength', 'coarse', 3);
    expect(strong.possession).toBeGreaterThan(weak.possession);
    expect(completion(strong)).toBeGreaterThan(completion(weak) + 0.01);
    for (const st of each) {
      for (const q of [0, 1]) {
        expect(st[q].possession).toBeGreaterThan(0.35);
        expect(st[q].completion).toBeGreaterThan(0.7);
        expect(st[q].completion).toBeLessThan(0.9);
      }
    }
  });

  it('patient, short passing keeps the ball better than direct, quick play', () => {
    const s = {
      home: side('home', tactics({ tempo: 1 as Dial, directness: 1 as Dial })),
      away: side('away', tactics({ tempo: 5 as Dial, directness: 5 as Dial })),
    };
    const [patient, direct] = season(s, 'style', 'coarse', 3);
    expect(patient.possession).toBeGreaterThan(direct.possession + 0.02);
    expect(completion(patient)).toBeGreaterThan(completion(direct) + 0.02);
  });
});

// ---------------------------------------------------------------------------
// Attacking and shooting (build step 4)
// ---------------------------------------------------------------------------

describe('spatial shot quality (xG)', () => {
  const GC = WIDTH / 2;
  const at = (x: number, y: number, header = false): number => xgFrom(0, x, y, header, false);

  it('a central chance is worth more than the same distance from an angle', () => {
    expect(at(LENGTH - 12, GC)).toBeGreaterThan(at(LENGTH - 12 * 0.6, GC + 12 * 0.8) * 1.5);
  });

  it('chances get worse with distance and headers are worth less', () => {
    let last = 1;
    for (const d of [6, 11, 16, 22, 30]) {
      const v = at(LENGTH - d, GC);
      expect(v).toBeLessThan(last);
      last = v;
    }
    expect(at(LENGTH - 8, GC)).toBeGreaterThan(0.2);
    expect(at(LENGTH - 30, GC)).toBeLessThan(0.05);
    expect(at(LENGTH - 8, GC, true)).toBeLessThan(at(LENGTH - 8, GC) * 0.8);
  });

  it('is the same for both sides attacking their own way', () => {
    expect(xgFrom(1, 14, 30, false, false)).toBeCloseTo(xgFrom(0, LENGTH - 14, WIDTH - 30, false, false), 12);
  });
});

interface Attack { matches: number; goals: number; shots: number; xg: number; inBox: number; goalsWithShot: number; goalsInBox: number; onTarget: number }

/** Shot and goal totals over a few whole matches, for one side or both. */
function attacking(s: SpatialSetup, seed: string, mode: SpatialMode, matches: number, sides: Side[] = [0, 1]): Attack {
  const a: Attack = { matches, goals: 0, shots: 0, xg: 0, inBox: 0, goalsWithShot: 0, goalsInBox: 0, onTarget: 0 };
  for (let k = 0; k < matches; k++) {
    const m = createSpatial(s, `${seed}-${k}`, mode);
    while (stepSpatial(m)) { /* play the match */ }
    const st = matchStats(m);
    for (const q of sides) {
      a.goals += st[q].goals; a.shots += st[q].shots; a.xg += st[q].xg; a.onTarget += st[q].onTarget;
    }
    for (const r of m.shotLog) {
      if (!sides.includes(r.side)) continue;
      if (inAttackBox(r.side, r.x, r.y)) a.inBox++;
    }
    for (const g of m.goalLog) {
      if (!sides.includes(g.side) || g.ownGoal || g.xg === 0) continue;
      // The shot it came from: his last one at or before the goal.
      let shot = null;
      for (const r of m.shotLog) if (r.player === g.scorer && r.ms <= g.ms) shot = r;
      if (!shot) continue;
      a.goalsWithShot++;
      if (inAttackBox(shot.side, shot.x, shot.y)) a.goalsInBox++;
    }
  }
  return a;
}

describe('spatial attacking and shooting', () => {
  it.each([['coarse', 12, 1.8, 3.8], ['fine', 4, 1.25, 4.5]] as [SpatialMode, number, number, number][])(
    'even sides make believable chances and goals (%s)',
    (mode, matches, lo, hi) => {
      const a = attacking(setup(), 'attack', mode, matches);
      expect(a.goals / matches).toBeGreaterThan(lo);
      expect(a.goals / matches).toBeLessThan(hi);
      // The target is 9 to 16 a team; fine matches sit at the top of it. Step 7 tightens this.
      expect(a.shots / matches / 2).toBeGreaterThan(8);
      expect(a.shots / matches / 2).toBeLessThan(18);
      // Most shots, and nearly all goals, come from inside the box.
      expect(a.inBox / a.shots).toBeGreaterThan(0.55);
      expect(a.goalsInBox / a.goalsWithShot).toBeGreaterThan(0.75);
      // Goals follow the chances.
      expect(a.goals / a.xg).toBeGreaterThan(0.6);
      expect(a.goals / a.xg).toBeLessThan(1.4);
      expect(a.onTarget / a.shots).toBeGreaterThan(0.25);
      expect(a.onTarget / a.shots).toBeLessThan(0.5);
    },
    60_000,
  );

  const finishing = (s: SpatialSide, v: number): SpatialSide => ({
    ...s, players: s.players.map((p, k) => (k === 0 ? p : { ...p, attributes: { ...p.attributes, fin: v } })),
  });
  const keeper = (s: SpatialSide, v: number): SpatialSide => ({
    ...s, players: s.players.map((p, k) => (k > 0 ? p : { ...p, attributes: { ...p.attributes, ref: v, han: v, gkp: v } })),
  });

  it('good finishers score more of their chances than poor ones', () => {
    const away = side('away', tactics());
    const good = attacking({ home: finishing(side('home', tactics()), 88), away }, 'finish', 'coarse', 10, [0]);
    const poor = attacking({ home: finishing(side('home', tactics()), 38), away }, 'finish', 'coarse', 10, [0]);
    expect(good.goals / good.xg).toBeGreaterThan(poor.goals / poor.xg + 0.4);
    expect(good.onTarget / good.shots).toBeGreaterThan(poor.onTarget / poor.shots);
  }, 60_000);

  it('a good keeper saves more than a poor one', () => {
    const home = side('home', tactics());
    const good = attacking({ home, away: keeper(side('away', tactics()), 88) }, 'keeper', 'coarse', 10, [0]);
    const poor = attacking({ home, away: keeper(side('away', tactics()), 38) }, 'keeper', 'coarse', 10, [0]);
    expect(good.goals / good.onTarget).toBeLessThan(poor.goals / poor.onTarget - 0.1);
    expect(good.goals).toBeLessThan(poor.goals);
  }, 60_000);
});

describe('spatial restarts', () => {
  it.each(['fine', 'coarse'] as SpatialMode[])('kick-offs, goal kicks and throw-ins go to the right side (%s)', (mode) => {
    const m = createSpatial(setup(), 'restarts', mode);
    let goals = 0, kick = 0, throws = 0, wrong = 0, lastKind = RESTART_NONE;
    while (stepSpatial(m)) {
      if (m.goalLog.length > goals) {
        const g = m.goalLog[goals++];
        // The side that conceded kicks off, once the ball is back on the spot.
        if (m.ball.state !== BALL_DEAD || m.restartKind !== RESTART_KICKOFF || m.restartSide !== 1 - g.side) wrong++;
      }
      if (m.restartKind !== lastKind) {
        if (m.restartKind === RESTART_KICKOFF && lastKind === RESTART_NONE) kick++;
        if (m.restartKind === RESTART_THROW_IN) {
          throws++;
          // To the other side from the last touch, from the touchline, taken by one of theirs.
          const k = m.onball.lastKick;
          if (k >= 0 && sideOf(k) === m.restartSide) wrong++;
          if (m.restartY !== 0 && m.restartY !== WIDTH) wrong++;
          if (sideOf(m.restartTaker) !== m.restartSide) wrong++;
        }
        lastKind = m.restartKind;
      }
    }
    const st = matchStats(m);
    expect(wrong).toBe(0);
    expect(kick).toBe(goals);
    expect(throws).toBe(st[0].throwIns + st[1].throwIns);
    // Fine matches have far fewer than real football's 40 or so (docs/DESIGN.md 17.15).
    expect(throws).toBeGreaterThan(3);
    expect(throws).toBeLessThan(90);
    expect(st[0].goalKicks + st[1].goalKicks).toBeGreaterThan(4);
  }, 30_000);
});
