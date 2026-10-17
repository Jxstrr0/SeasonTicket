/**
 * Spatial match engine, build steps 2 to 5: shape and movement, passing and possession,
 * attacking and shooting, then the laws of the game. Checks the deterministic maths, the ban on
 * platform maths, ball flight, team shape, tactic responses, determinism and replay,
 * whole-match sanity, that possession, passing, shots and goals look believable, restarts,
 * offside, set-piece takers, the back-pass rule, sendings-off and the referee's rates. The time
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
import { FOUL_FRONT, foul, foulChance, offsideCall, offsideNow, played } from '../src/sim/spatial/rules';
import { inAttackBox, xgFrom } from '../src/sim/spatial/shot';
import {
  ATTRS, A_FIN, A_PAC, BALL_DEAD, BALL_HELD, KICK_CLEAR, KICK_PASS, LENGTH, N, RESTART_CORNER, RESTART_FREE_KICK, RESTART_KICKOFF,
  RESTART_NONE, RESTART_PENALTY, RESTART_THROW_IN, SP_CORNER, SP_GOAL_KICK, SP_NONE, SP_THROW, WIDTH, depthOf, idOf,
  sideOf, type SpatialMatch,
} from '../src/sim/spatial/state';
import { FRAME_VALUES, ROLE, type Side, type SpatialMode, type SpatialSetup, type SpatialSide } from '../src/sim/spatial/types';
import type { Dial, Tactics } from '../src/sim/types';
import { listSources, readSource } from './helpers/node.mjs';
import { setup, side, tactics } from './helpers/spatialFixtures';

/**
 * Run with every rating as it is (skillSpread.keep 1). Tests of how an attribute drives play
 * use it, so the share of a gap that shows on the day (tested on its own) does not blur them.
 */
function fullSpread<R>(work: () => R): R {
  const SS = SPATIAL_TUNING.skillSpread;
  const keep = SS.keep;
  SS.keep = 1;
  try { return work(); } finally { SS.keep = keep; }
}

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
  const shared = ['src/sim/match/strength.ts', 'src/sim/match/ratings.ts', 'src/sim/rng.ts'];

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
    // Both tire as the match goes on, so the gap grows a little late on.
    expect(b.markDist).toBeLessThan(3.5);
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
        // A sent-off player waits off the pitch.
        if (!m.on[i]) continue;
        const x = m.px[i], y = m.py[i];
        if (!(x >= 0 && x <= LENGTH && y >= 0 && y <= WIDTH)) bad++;
      }
      if (!Number.isFinite(m.ball.x) || !Number.isFinite(m.ball.y) || !Number.isFinite(m.ball.z)) bad++;
    }
    expect(bad).toBe(0);
    expect(m.clockMs).toBeGreaterThanOrEqual(5_400_000);
    // Outfielders run about 10 km on average and the busiest about 13, as in real matches;
    // centre-backs run a little short of the real 9 to 10, about 7.5 to 8.
    for (let i = 0; i < N; i++) {
      if (!m.on[i]) continue;
      const km = m.dist[i] / 1000;
      if (i % 11 === 0) { if (m.who[i] === i) expect(km).toBeLessThan(8); continue; }
      expect(km).toBeGreaterThan(7);
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
        // Top real leagues have about 10 a minute and lower ones about 8; ours run 8 to 9.
        const perMinute = (st[0].passes + st[1].passes) / 90;
        expect(perMinute).toBeGreaterThan(7);
        expect(perMinute).toBeLessThan(19);
      }
    },
  );

  it('the better side keeps more of the ball and completes more passes', () => {
    const s = { home: side('home', tactics(), 70), away: side('away', tactics(), 60) };
    const [strong, weak, each] = fullSpread(() => season(s, 'strength', 'coarse', 3));
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

interface Attack {
  matches: number; goals: number; shots: number; xg: number; inBox: number; goalsWithShot: number; goalsInBox: number; onTarget: number;
  /** Goals and xG from open play (not penalties or direct free kicks, which use set pieces, not finishing). */
  openGoals: number; openXg: number;
}

/** Shot and goal totals over a few whole matches, for one side or both. */
function attacking(s: SpatialSetup, seed: string, mode: SpatialMode, matches: number, sides: Side[] = [0, 1]): Attack {
  const a: Attack = { matches, goals: 0, shots: 0, xg: 0, inBox: 0, goalsWithShot: 0, goalsInBox: 0, onTarget: 0, openGoals: 0, openXg: 0 };
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
      if (!r.setPiece) { a.openXg += r.xg; if (r.outcome === 'goal') a.openGoals++; }
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
  it.each([['coarse', 12, 1.8, 3.8], ['fine', 8, 1.25, 4.5]] as [SpatialMode, number, number, number][])(
    'even sides make believable chances and goals (%s)',
    (mode, matches, lo, hi) => {
      const a = attacking(setup(), 'attack', mode, matches);
      expect(a.goals / matches).toBeGreaterThan(lo);
      expect(a.goals / matches).toBeLessThan(hi);
      // The target is 9 to 16 a team.
      expect(a.shots / matches / 2).toBeGreaterThan(8);
      expect(a.shots / matches / 2).toBeLessThan(19.5);
      // Most shots, and nearly all goals, come from inside the box.
      expect(a.inBox / a.shots).toBeGreaterThan(0.55);
      expect(a.goalsInBox / a.goalsWithShot).toBeGreaterThan(0.75);
      // Goals follow the chances (over whole seasons goals run 0.9 to 1.1 times xG; a handful
      // of matches swings wider).
      expect(a.goals / a.xg).toBeGreaterThan(0.5);
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

  // 24 matches each: with goals this rare, fewer are not enough to tell the effect from luck.
  it('good finishers score more of their chances than poor ones', () => {
    const away = side('away', tactics());
    const good = fullSpread(() => attacking({ home: finishing(side('home', tactics()), 88), away }, 'finish', 'coarse', 24, [0]));
    const poor = fullSpread(() => attacking({ home: finishing(side('home', tactics()), 38), away }, 'finish', 'coarse', 24, [0]));
    // Real finishers beat their xG by a few tenths at most; over 24 matches the gap is about 0.3.
    expect(good.openGoals / good.openXg).toBeGreaterThan(poor.openGoals / poor.openXg + 0.2);
    expect(good.onTarget / good.shots).toBeGreaterThan(poor.onTarget / poor.shots);
  }, 60_000);

  it('a good keeper saves more than a poor one', () => {
    const home = side('home', tactics());
    const good = fullSpread(() => attacking({ home, away: keeper(side('away', tactics()), 88) }, 'keeper', 'coarse', 24, [0]));
    const poor = fullSpread(() => attacking({ home, away: keeper(side('away', tactics()), 38) }, 'keeper', 'coarse', 24, [0]));
    expect(good.goals / good.onTarget).toBeLessThan(poor.goals / poor.onTarget - 0.05);
    expect(good.goals).toBeLessThan(poor.goals);
  }, 60_000);
});

describe('spatial skill spread and home advantage', () => {
  const SS = SPATIAL_TUNING.skillSpread;
  const H = SPATIAL_TUNING.home;
  const rated = (v: number): SpatialSetup => ({ home: side('home', tactics(), v), away: side('away', tactics(), v) });

  it('pulls every rating part of the way towards the pivot, the same for both sides with no crowd', () => {
    const m = createSpatial(rated(90), 'spread', 'coarse');
    const want = SS.pivot + SS.keep * (90 - SS.pivot);
    for (const i of [3, 14]) {
      expect(m.baseAttr[i * ATTRS + A_FIN]).toBeCloseTo(want, 9);
      expect(m.baseAttr[i * ATTRS + A_PAC]).toBeCloseTo(want, 9);
    }
    const low = createSpatial(rated(40), 'spread', 'coarse');
    expect(low.baseAttr[3 * ATTRS + A_FIN]).toBeCloseTo(SS.pivot + SS.keep * (40 - SS.pivot), 9);
  });

  it("a home crowd lifts the home side's skills (not pace) and leans the referee its way", () => {
    const full = createSpatial({ ...rated(70), crowd: 1 }, 'home', 'coarse');
    const none = createSpatial(rated(70), 'home', 'coarse');
    const base = SS.pivot + SS.keep * (70 - SS.pivot);
    expect(full.baseAttr[3 * ATTRS + A_FIN]).toBeCloseTo(base + H.attrPoints, 9);
    expect(full.baseAttr[3 * ATTRS + A_PAC]).toBeCloseTo(base, 9);
    expect(full.baseAttr[14 * ATTRS + A_FIN]).toBeCloseTo(base, 9);
    // An empty ground still gives the floor's share.
    const empty = createSpatial({ ...rated(70), crowd: 0 }, 'home', 'coarse');
    expect(empty.baseAttr[3 * ATTRS + A_FIN]).toBeCloseTo(base + H.attrPoints * H.attendanceFloor, 9);
    // The same challenge by a home player is called less often with a full ground.
    expect(foulChance(full, 3, 14, 0.1, false)).toBeCloseTo(foulChance(none, 3, 14, 0.1, false) * H.foulLean, 9);
    expect(foulChance(full, 14, 3, 0.1, false)).toBeCloseTo(foulChance(none, 14, 3, 0.1, false), 9);
  });
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

// ---------------------------------------------------------------------------
// Laws of the game (build step 5, docs/DESIGN.md 17.6)
// ---------------------------------------------------------------------------

/**
 * A frozen scene for offside: home (attacking +x, so depth is x) is about to play the ball
 * from (bx, 34) with its number 7 (index 6). Home's attackers 10, 9 and 11 (indices 9, 8, 10)
 * stand at `att` (x), everyone else of home's in their own half. Away's keeper stands at `gk`,
 * its two deepest outfielders at `deep`, the rest at x = 55.
 */
function offsideScene(bx: number, att: number[], deep: [number, number], gk = 103): SpatialMatch {
  const m = createSpatial(setup(), 'offside', 'fine');
  freezeBall(m, bx, 34, 0);
  m.onball.setPiece = SP_NONE;
  for (let i = 0; i < 11; i++) { m.px[i] = 20; m.py[i] = 4 + i * 6; }
  m.px[6] = bx;
  m.py[6] = 34;
  att.forEach((x, k) => { m.px[[9, 8, 10][k]] = x; });
  for (let i = 11; i < 22; i++) { m.px[i] = 55; m.py[i] = 4 + (i - 11) * 6; }
  m.px[11] = gk;
  m.py[11] = 34;
  m.px[12] = deep[0];
  m.px[13] = deep[1];
  return m;
}

describe('spatial offside', () => {
  it('beyond the ball and the second-last opponent in their half is offside; level is onside', () => {
    const m = offsideScene(60, [92, 90, 88], [90, 85]);
    played(m, 6);
    expect(offsideNow(m, 9)).toBe(true);
    expect(offsideNow(m, 8)).toBe(false);
    expect(offsideNow(m, 10)).toBe(false);
  });

  it('a backward pass to a man beyond the line is onside', () => {
    const m = offsideScene(95, [92], [90, 85]);
    played(m, 6);
    expect(offsideNow(m, 9)).toBe(false);
  });

  it('nobody is offside in his own half', () => {
    // Away has pushed up: its keeper at 70 and outfielders at 50 and 48 make the line 50.
    const m = offsideScene(40, [51], [50, 48], 70);
    played(m, 6);
    expect(offsideNow(m, 9)).toBe(false);
  });

  it('with the keeper out, the two deepest outfielders set the line', () => {
    const m = offsideScene(60, [87, 84], [90, 85], 60);
    played(m, 6);
    expect(offsideNow(m, 9)).toBe(true);
    expect(offsideNow(m, 8)).toBe(false);
  });

  it.each([['throw-in', SP_THROW], ['corner', SP_CORNER], ['goal kick', SP_GOAL_KICK]] as [string, number][])(
    'nobody is offside from a %s',
    (_name, sp) => {
      const m = offsideScene(60, [92], [90, 85]);
      m.onball.setPiece = sp;
      played(m, 6);
      expect(offsideNow(m, 9)).toBe(false);
    },
  );

  it('an offside player who plays the ball gives away an indirect free kick where he is', () => {
    const m = offsideScene(60, [92, 88], [90, 85]);
    played(m, 6);
    // An onside team-mate can play it without a call.
    expect(offsideCall(m, 8)).toBe(false);
    expect(offsideCall(m, 9)).toBe(true);
    expect(m.restartKind).toBe(RESTART_FREE_KICK);
    expect(m.restartSide).toBe(1);
    expect(m.rules.indirect).toBe(true);
    expect(m.rules.offsides[0]).toBe(1);
    expect(m.events.at(-1)).toMatchObject({ kind: 'offside', side: 0, player: 9 });
    // The flag only goes up once.
    expect(offsideNow(m, 9)).toBe(false);
  });
});

describe('spatial set pieces and the back-pass rule', () => {
  const takers = (p: string) => ({ penalties: `${p}-9`, freeKicks: `${p}-7`, corners: `${p}-8` });
  const named = setup({ setPieceTakers: takers('home') }, { setPieceTakers: takers('away') });

  it('the named taker takes every penalty, free kick near goal and corner while he is on', () => {
    const FK = SPATIAL_TUNING.freeKick;
    let pens = 0, fks = 0, corners = 0, setShots = 0, wrong = 0;
    for (let k = 0; k < 8; k++) {
      const m = createSpatial(named, `takers-${k}`, 'coarse');
      let last = RESTART_NONE;
      const check = (id: string): void => {
        let onPitch = false;
        for (let j = 0; j < N; j++) if (m.on[j] && idOf(m, j) === id) onPitch = true;
        if (onPitch && idOf(m, m.restartTaker) !== id) wrong++;
      };
      while (stepSpatial(m)) {
        if (m.restartKind === last) continue;
        last = m.restartKind;
        const t = takers(m.restartSide === 0 ? 'home' : 'away');
        if (last === RESTART_PENALTY) { pens++; check(t.penalties); }
        else if (last === RESTART_CORNER) { corners++; check(t.corners); }
        else if (last === RESTART_FREE_KICK) {
          const g = LENGTH - depthOf(m.restartSide, m.restartX), e = m.restartY - 34;
          if (Math.sqrt(g * g + e * e) <= FK.namedWithin) { fks++; check(t.freeKicks); }
        }
      }
      // Every penalty and direct free-kick shot was struck by the named man.
      for (const r of m.shotLog) {
        if (!r.setPiece) continue;
        setShots++;
        const id = (r.side === 0 ? named.home : named.away).players[r.player % 11].id;
        if (id !== takers(r.side === 0 ? 'home' : 'away')[r.setPiece === 'penalty' ? 'penalties' : 'freeKicks']) wrong++;
      }
    }
    expect(wrong).toBe(0);
    expect(pens).toBeGreaterThan(0);
    expect(fks).toBeGreaterThan(5);
    expect(corners).toBeGreaterThan(5);
    expect(setShots).toBeGreaterThan(0);
  }, 30_000);

  it.each(['fine', 'coarse'] as SpatialMode[])('a keeper never handles a pass from a team-mate (%s)', (mode) => {
    let catches = 0, wrong = 0;
    for (let k = 0; k < 3; k++) {
      const m = createSpatial(setup(), `back-pass-${k}`, mode);
      for (;;) {
        const ob = m.onball;
        const kind = ob.passKind, from = ob.passSide, kicker = ob.lastKick;
        const held = m.ball.state === BALL_HELD;
        if (!stepSpatial(m)) break;
        const o = m.ball.owner;
        if (held || m.ball.state !== BALL_HELD || !ob.inHands || o < 0 || o % 11 !== 0) continue;
        catches++;
        if ((kind === KICK_PASS || kind === KICK_CLEAR) && from === sideOf(o) && kicker !== o) wrong++;
      }
    }
    expect(catches).toBeGreaterThan(5);
    expect(wrong).toBe(0);
  }, 30_000);
});

describe('spatial sendings-off', () => {
  /** A straight red for whoever commits the next foul. */
  function sendOffNow(m: SpatialMatch, f: number, v: number): void {
    const CD = SPATIAL_TUNING.card;
    const keep = CD.straightRed;
    CD.straightRed = 1;
    try { foul(m, f, v, FOUL_FRONT, false); } finally { CD.straightRed = keep; }
  }

  it('a sent-off player leaves the pitch for good and his side plays on with ten', () => {
    const m = createSpatial(setup(), 'red-card', 'fine');
    runSeconds(m, 120);
    sendOffNow(m, 13, 9);
    expect(m.on[13]).toBe(0);
    expect(m.rules.reds[1]).toBe(1);
    expect(m.events.some((e) => e.kind === 'red' && e.player === 13)).toBe(true);
    let touched = 0, onPitch = 0;
    while (stepSpatial(m)) {
      if (m.ball.owner === 13 || m.onball.lastKick === 13) touched++;
      if (m.px[13] >= 0 && m.px[13] <= LENGTH && m.py[13] >= 0 && m.py[13] <= WIDTH) onPitch++;
    }
    expect(touched).toBe(0);
    expect(onPitch).toBe(0);
    expect(m.on.slice(11).reduce((a, b) => a + b, 0)).toBe(10);
    expect(matchStats(m)[1].reds).toBe(1);
  }, 30_000);

  it('a sent-off keeper is replaced in goal by an outfielder', () => {
    const m = createSpatial(setup(), 'red-keeper', 'fine');
    runSeconds(m, 120);
    sendOffNow(m, 11, 9);
    // Index 11 is always the keeper: an outfielder has moved into it.
    expect(m.on[11]).toBe(1);
    expect(m.who[11]).not.toBe(11);
    const gone = Array.from(m.who).indexOf(11);
    expect(m.on[gone]).toBe(0);
    runSeconds(m, 120);
    expect(depthOf(1, m.px[11])).toBeLessThan(20);
  }, 30_000);
});

describe('spatial referee rates', () => {
  it.each([['coarse', 10], ['fine', 4]] as [SpatialMode, number][])('fouls, cards, offsides and penalties are in the right range (%s)', (mode, matches) => {
    const sum = { fouls: 0, yellows: 0, reds: 0, offsides: 0, penalties: 0, injuries: 0, corners: 0, freeKicks: 0 };
    let mismatched = 0;
    for (let k = 0; k < matches; k++) {
      const m = createSpatial(setup(), `referee-${k}`, mode);
      while (stepSpatial(m)) { /* play the match */ }
      const st = matchStats(m);
      for (const q of [0, 1] as const) for (const key of Object.keys(sum) as (keyof typeof sum)[]) sum[key] += st[q][key];
      // The stats and the event list agree.
      const count = (kind: string, side: Side) => m.events.filter((e) => e.kind === kind && e.side === side).length;
      for (const q of [0, 1] as Side[]) {
        if (count('foul', q) !== st[q].fouls || count('yellow', q) !== st[q].yellows || count('offside', q) !== st[q].offsides) mismatched++;
        // A second yellow is logged as a yellow and a red.
        if (count('red', q) !== st[q].reds) mismatched++;
        // A penalty is logged for the side that won it.
        if (count('penalty', q) !== st[q].penalties) mismatched++;
      }
    }
    expect(mismatched).toBe(0);
    const perTeam = (v: number) => v / matches / 2;
    const perMatch = (v: number) => v / matches;
    // Targets: fouls 9 to 15 a team, yellows 3.5 to 4.5 and reds 0.1 to 0.2 a match, offsides
    // 1 to 4 a team, penalties 0.25 to 0.35 a match (docs/DESIGN.md 17.10). These bounds are
    // looser for a few matches; the slow suite (npm run test:slow) checks the targets over whole seasons.
    expect(perTeam(sum.fouls)).toBeGreaterThan(6);
    expect(perTeam(sum.fouls)).toBeLessThan(18);
    expect(perMatch(sum.yellows)).toBeGreaterThan(1.5);
    expect(perMatch(sum.yellows)).toBeLessThan(7.5);
    expect(perMatch(sum.reds)).toBeLessThan(1.25);
    expect(perTeam(sum.offsides)).toBeGreaterThan(0.25);
    expect(perTeam(sum.offsides)).toBeLessThan(8);
    expect(perMatch(sum.penalties)).toBeLessThan(1.5);
    expect(perMatch(sum.injuries)).toBeLessThan(1.5);
    expect(perTeam(sum.corners)).toBeGreaterThan(0.4);
    // Every foul outside the box and every offside gives a free kick.
    expect(sum.freeKicks).toBeGreaterThan(sum.fouls * 0.6);
  }, 60_000);

  it('the same seed gives the same fouls, cards and shots', () => {
    const run = () => {
      const m = createSpatial(setup(), 'same-referee', 'coarse');
      while (stepSpatial(m)) { /* play the match */ }
      return JSON.stringify([m.events, m.shotLog, m.goalLog]);
    };
    expect(run()).toBe(run());
  }, 30_000);
});
