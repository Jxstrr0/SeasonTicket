import { describe, expect, it } from 'vitest';
import { setupWithBench } from './helpers/spatialFixtures';
import { KEEPER_FILL, matchKits } from '../src/ui/pitch2d';
import { sceneKits, sceneOf } from '../src/ui/career/match3d';
import type { StadiumSnapshot } from '../src/render/stadium/types';
import tuning from '../src/data/tuning/match3d.json';
import { createSpatial, spatialFinished, stepSpatial } from '../src/sim/spatial/engine';
import { MatchTape } from '../src/ui/career/match3dTape';
import { ACT, CHANCE_POST, CHANCE_SAVED, type ActionCue, type MatchFrame3D } from '../src/render/match/types';
import { Move, Pose, env, goalRole, keys } from '../src/render/match/actions';
import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA_PRESETS, MatchCamera, ownersBox } from '../src/render/match/cameras';
import { Director, replayFor, type Replay } from '../src/ui/career/match3dDirector';
import { PERIOD } from '../src/sim/spatial/types';

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
      if (c.kind !== ACT.GOAL && c.kind !== ACT.CHANCE) expect(c.player).toBeGreaterThanOrEqual(0);
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

describe('3D match cameras', () => {
  const ground = (level: number, boxRows: number) => ({ stands: { west: { level, boxRows } } }) as unknown as StadiumSnapshot;

  it('places every camera above the pitch, inside the ground, looking at the play', () => {
    for (const level of [0, 2, 4]) {
      const camera = new PerspectiveCamera();
      const cam = new MatchCamera(camera, ground(level, level >= 2 ? 1 : 0));
      cam.resize(844 / 390);
      for (const key of [...CAMERA_PRESETS, 'side'] as const) {
        for (const x of [-50, 0, 30]) {
          cam.set(key);
          cam.follow(x, 10, true);
          cam.tick(0.016);
          const p = camera.position;
          expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
          expect(p.y).toBeGreaterThan(1);
          expect(Math.abs(p.x)).toBeLessThan(70);
          expect(Math.abs(p.z)).toBeLessThan(80);
          // Looking down and towards the ball, not away from it.
          const dir = camera.getWorldDirection(new Vector3());
          expect(dir.y).toBeLessThan(0.05);
          const toBall = new Vector3(Math.max(-52.5, Math.min(52.5, x)), 0, 10).sub(p).normalize();
          expect(dir.dot(toBall)).toBeGreaterThan(key === 'box' ? 0.6 : 0.8);
          expect(camera.fov).toBeGreaterThan(10);
          expect(camera.fov).toBeLessThan(90);
        }
      }
    }
  });

  it("sits the owner's box behind the glass, and at the back of a stand without boxes", () => {
    const boxed = ownersBox(ground(3, 1));
    expect(boxed.z).toBeGreaterThan(40);
    expect(boxed.y).toBeGreaterThan(3);
    const plain = ownersBox(ground(1, 0));
    expect(plain.z).toBeGreaterThan(40);
  });

  it('swaps the behind-the-goal camera with the play, unless a replay holds it', () => {
    const camera = new PerspectiveCamera();
    const cam = new MatchCamera(camera, ground(2, 0));
    cam.resize(2);
    cam.follow(40, 0, true);
    cam.set('goal');
    cam.tick(0.016);
    expect(camera.position.x).toBeGreaterThan(52.5);
    // A little past halfway is not enough to swap; well into the other half is.
    cam.follow(-5, 0, true);
    cam.tick(0.016);
    expect(camera.position.x).toBeGreaterThan(52.5);
    cam.follow(-30, 0, true);
    cam.tick(0.016);
    expect(camera.position.x).toBeLessThan(-52.5);
    cam.set('goal', 1);
    cam.follow(-40, 0, true);
    cam.tick(0.016);
    expect(camera.position.x).toBeGreaterThan(52.5);
  });
});

describe('3D match replays', () => {
  // One full match as the live view sees it, with the replays the view would play, both
  // with the whole match in 3D and in highlights mode.
  const m = createSpatial(setupWithBench(), 'replay1', 'fine');
  const tape = new MatchTape();
  const full = new Director();
  const hl = new Director();
  const played: { r: Replay; inside: boolean; hl: boolean }[] = [];
  let longest = 0;
  const take = (d: Director, ms: number, idle: boolean, isHl: boolean): void => {
    for (let r = d.due(ms, idle); r; r = idle ? d.due(ms, idle) : null) {
      // Every take lies on the tape when the replay starts.
      const inside = r.takes.every((t) => t.from >= tape.oldest && t.to <= ms && t.from < t.to);
      played.push({ r, inside, hl: isHl });
    }
  };
  for (let k = 0; k < 200_000 && !spatialFinished(m); k++) {
    stepSpatial(m);
    tape.capture(m);
    const shown = MatchTape.shown(m.clockMs);
    const shootout = m.period >= PERIOD.SHOOTOUT;
    full.scan(tape.cues, shootout, false);
    hl.scan(tape.cues, shootout, true);
    take(full, shown, false, false);
    take(hl, shown, false, true);
    longest = Math.max(longest, tape.latest - tape.oldest);
  }
  // The final whistle: the view stands still, and what is left plays.
  take(full, MatchTape.shown(m.clockMs), true, false);
  take(hl, MatchTape.shown(m.clockMs), true, true);
  const of = (kind: string, isHl: boolean) => played.filter((p) => p.r.kind === kind && p.hl === isHl);

  it('replays every goal, from inside the tape, on two angles in slow motion', () => {
    const goals = of('goal', false);
    expect(m.goalLog.length).toBeGreaterThan(0);
    // The tape sees a goal at the step after the engine logs it.
    expect(goals.length).toBe(m.goalLog.length);
    goals.forEach((p, i) => expect(Math.abs(p.r.atMs - m.goalLog[i].ms)).toBeLessThanOrEqual(m.stepMs));
    for (const p of goals) {
      expect(p.inside).toBe(true);
      expect(p.r.takes.length).toBe(2);
      for (const t of p.r.takes) expect(t.rate).toBeLessThan(1);
    }
    expect(longest).toBeGreaterThanOrEqual(tuning.replays.keepS * 1000 - 600);
  });

  it('replays big chances, and in highlights mode every big moment from its build-up', () => {
    const big = m.shotLog.filter((s) => s.outcome !== 'goal' && (s.xg >= tuning.replays.bigChanceXg || s.outcome === 'post'));
    const chances = of('chance', false);
    expect(chances.length).toBeLessThanOrEqual(big.length);
    const moments = played.filter((p) => p.hl);
    expect(of('goal', true).length).toBe(m.goalLog.length);
    expect(moments.length).toBeGreaterThan(of('chance', false).length + m.goalLog.length);
    for (const p of moments) {
      expect(p.inside).toBe(true);
      expect(p.r.takes[0]).toMatchObject({ camera: 'preset', rate: 1 });
    }
    const seconds = moments.reduce((n, p) => n + p.r.takes.reduce((s, t) => s + (t.to - t.from) / t.rate, 0), 0) / 1000;
    console.log(`replays: ${of('goal', false).length} goals, ${chances.length} of ${big.length} big chances; highlights: ${moments.length} moments, ${Math.round(seconds)} s in 3D`);
  });

  it('skips the shootout and starts a waiting replay once the match stands still', () => {
    const goal = { id: 5, kind: ACT.GOAL, player: -1, atMs: 60_000, fromMs: 60_000, x: 105, y: 34, z: 0, power: 1, flag: 0 } as ActionCue;
    const d = new Director();
    d.scan([goal], true, false);
    expect(d.pending.length).toBe(0);
    const d2 = new Director();
    d2.scan([goal], false, false);
    expect(d2.due(60_500, false)).toBeNull();
    const r = d2.due(60_500, true);
    expect(r?.kind).toBe('goal');
    expect(r?.takes[0].end).toBe(1);
  });

  it('keeps small shots out of the full replays, and drops a chance the goal replay covers', () => {
    const shot = (id: number, atMs: number, xg: number, flag: number) =>
      ({ id, kind: ACT.CHANCE, player: -1, atMs, fromMs: atMs, x: 12, y: 30, z: 0, power: xg, flag }) as ActionCue;
    expect(replayFor(shot(1, 0, 0.05, 1), false)).toBeNull();
    expect(replayFor(shot(1, 0, 0.05, 1), true)).toBeNull();
    expect(replayFor(shot(1, 0, 0.05, 1 + CHANCE_SAVED), true)?.takes.length).toBe(1);
    const post = replayFor(shot(1, 0, 0.05, CHANCE_POST), false);
    expect(post?.takes.length).toBe(1);
    expect(post?.takes[0].end).toBe(-1);
    const d = new Director();
    const goal = { id: 3, kind: ACT.GOAL, player: 2, atMs: 4000, fromMs: 4000, x: 0, y: 34, z: 0, power: 1, flag: 1 } as ActionCue;
    d.scan([shot(1, 2000, 0.6, 1), shot(2, 3000, 0.5, 1), goal], false, false);
    expect(d.pending.map((p) => p.kind)).toEqual(['goal']);
  });
});
