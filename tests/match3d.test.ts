import { describe, expect, it } from 'vitest';
import { setupWithBench } from './helpers/spatialFixtures';
import { KEEPER_FILL, matchKits } from '../src/ui/pitch2d';
import { sceneKits, sceneOf } from '../src/ui/career/match3d';
import type { StadiumSnapshot } from '../src/render/stadium/types';
import tuning from '../src/data/tuning/match3d.json';

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
