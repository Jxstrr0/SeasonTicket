import { describe, expect, it } from 'vitest';
import { setupWithBench } from './helpers/spatialFixtures';
import { KEEPER_FILL, matchKits } from '../src/ui/pitch2d';
import { sceneKits, sceneOf } from '../src/ui/career/match3d';
import type { StadiumSnapshot } from '../src/render/stadium/types';
import tuning from '../src/data/tuning/match3d.json';
import { createSpatial, spatialFinished, stepSpatial } from '../src/sim/spatial/engine';
import { MatchTape } from '../src/ui/career/match3dTape';
import { ACT, type ActionCue, type MatchFrame3D } from '../src/render/match/types';
import { Move, Pose, env, goalRole, keys } from '../src/render/match/actions';

describe('3D match scene', () => {
  it('dresses both sides in the 2D kits, with the keepers in their own colours', () => {
    const setup = setupWithBench();
    const k = matchKits(setup);
    const { kits, keepers } = sceneKits(setup);
    for (const i of [0, 1] as const) {
      expect(kits[i].shirt).toBe(k[i].fill);
      expect(kits[i].shorts).toBe(k[i].edge);
      expect(keepers[i].shirt).toBe(KEEPER_FILL[i]);
      expect(keepers[i].shirt).not.toBe(kits[0].shirt);
      expect(keepers[i].shirt).not.toBe(kits[1].shirt);
    }
  });

  it('gives every person code a stable id, starters and bench alike', () => {
    const setup = setupWithBench();
    const ground = {} as StadiumSnapshot;
    const scene = sceneOf(setup, ground);
    expect(scene.people).toHaveLength(40);
    expect(scene.people[0]).toBe(setup.home.players[0].id);
    expect(scene.people[11]).toBe(setup.away.players[0].id);
    expect(new Set(scene.people.filter(Boolean)).size).toBe(scene.people.filter(Boolean).length);
    expect(scene.people.filter(Boolean).length).toBe(40);
    expect(scene.ground).toBe(ground);
    expect(sceneOf(setup, ground)).toEqual(scene);
  });

  it('has gaits in speed order and a camera inside the field-of-view clamp', () => {
    const speeds = tuning.players.gaits.map((g) => g.speed);
    expect([...speeds].sort((a, b) => a - b)).toEqual(speeds);
    expect(tuning.camera.minVfov).toBeLessThan(tuning.camera.maxVfov);
    expect(tuning.camera.z).toBeLessThan(40);
  });
});

function emptyFrame(): MatchFrame3D {
  return {
    px: new Float32Array(22), py: new Float32Array(22), vx: new Float32Array(22), vy: new Float32Array(22),
    on: new Uint8Array(22), who: new Int16Array(22), ballX: 0, ballY: 0, ballZ: 0, ballState: 0, owner: -1,
    inHands: false, overhead: false, matchMs: 0, cues: [],
  };
}

describe('3D match actions', () => {
  // One full match, read off the engine step by step as the live view does.
  const m = createSpatial(setupWithBench(), 'tape1', 'fine');
  const tape = new MatchTape();
  const cues: ActionCue[] = [];
  const seen = new Set<number>();
  let lagOk = true;
  const f = emptyFrame();
  for (let k = 0; k < 200_000 && !spatialFinished(m); k++) {
    stepSpatial(m);
    tape.capture(m);
    for (const c of tape.cues) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      cues.push(c);
      // A cue arrives before the view, which runs lagMs behind, reaches its contact.
      if (c.kind !== ACT.GOAL && c.kind !== ACT.FALL && MatchTape.shown(m.clockMs) > c.atMs + m.stepMs) lagOk = false;
    }
    if (k === 3000) {
      tape.frameAt(MatchTape.shown(m.clockMs), f);
    }
  }
  const count = (kind: number): number => cues.filter((c) => c.kind === kind).length;

  it('finds the touches of a match: kicks, first touches, headers, tackles, throw-ins', () => {
    expect(count(ACT.KICK)).toBeGreaterThan(400);
    expect(count(ACT.TOUCH)).toBeGreaterThan(300);
    expect(count(ACT.HEADER)).toBeGreaterThan(10);
    expect(count(ACT.CHEST)).toBeGreaterThan(5);
    expect(count(ACT.TACKLE) + count(ACT.SLIDE)).toBeGreaterThan(50);
    expect(count(ACT.SLIDE)).toBeGreaterThan(0);
    expect(count(ACT.THROW)).toBeGreaterThan(5);
    expect(cues.filter((c) => c.kind === ACT.KICK && c.flag === 1).length).toBeGreaterThan(20);
    for (const c of cues) {
      if (c.kind !== ACT.GOAL) expect(c.player).toBeGreaterThanOrEqual(0);
      expect(c.player).toBeLessThan(22);
      expect(c.power).toBeGreaterThanOrEqual(0);
    }
    const ids = cues.map((c) => c.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('gives every goal a celebration and sends keepers after shots', () => {
    expect(count(ACT.GOAL)).toBe(m.goalLog.length);
    for (const c of cues.filter((q) => q.kind === ACT.DIVE)) {
      expect(c.player % 11).toBe(0);
      expect(c.fromMs).toBeLessThanOrEqual(c.atMs);
    }
    expect(count(ACT.DIVE) + count(ACT.CATCH)).toBeGreaterThan(3);
  });

  it('hands cues over before the lagging view reaches them', () => {
    expect(lagOk).toBe(true);
    expect(f.matchMs).toBeGreaterThan(0);
    expect(f.cues).toBe(tape.cues);
  });

  it('eases keyed values and envelopes', () => {
    const k = [0, 0, 1, 10, 2, 0];
    expect(keys(-1, k)).toBe(0);
    expect(keys(0.5, k)).toBeCloseTo(5);
    expect(keys(1, k)).toBe(10);
    expect(keys(3, k)).toBe(0);
    expect(env(0.5, 0, 1, 2, 3)).toBeCloseTo(0.5);
    expect(env(1.5, 0, 1, 2, 3)).toBe(1);
    expect(env(3.5, 0, 1, 2, 3)).toBe(0);
  });

  it('swings the kicking leg back before the strike and through after it', () => {
    const cue: ActionCue = { id: 1, kind: ACT.KICK, player: 3, atMs: 5000, fromMs: 5000, x: 60, y: 34, z: 0, power: 0.8, flag: 0 };
    const mv = new Move(cue);
    expect(mv.start).toBeLessThan(cue.atMs);
    const ctx = { x: 0, z: 0, heading: Math.PI / 2, left: false };
    const back = mv.at(cue.atMs - 80, ctx).leg[1].flex;
    const through = mv.at(cue.atMs + 160, ctx).leg[1].flex;
    expect(back).toBeLessThan(0);
    expect(through).toBeGreaterThan(30);
    // A left-footer mirrors it.
    const left = new Move(cue).at(cue.atMs + 160, { ...ctx, left: true });
    expect(left.leg[0].flex).toBeGreaterThan(30);
    const p = new Pose();
    p.yaw = 10;
    p.mirror();
    expect(p.yaw).toBe(-10);
  });

  it('celebrates with the scorer and drops the other side', () => {
    const goal: ActionCue = { id: 1, kind: ACT.GOAL, player: 9, atMs: 0, fromMs: 0, x: 105, y: 34, z: 0, power: 0, flag: 0 };
    expect(goalRole(goal, 9, 0)).toBe(1);
    expect(goalRole(goal, 4, 10)).toBe(2);
    expect(goalRole(goal, 4, 80)).toBe(0);
    expect(goalRole(goal, 0, 90)).toBe(3);
    expect(goalRole(goal, 15, 5)).toBe(4);
    expect(goalRole(goal, 11, 5)).toBe(5);
    // An own goal has no scorer to celebrate.
    expect(goalRole({ ...goal, player: 14, flag: 2 }, 14, 0)).toBe(4);
  });
});
