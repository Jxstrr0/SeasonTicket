import { describe, expect, it } from 'vitest';
import tuning from '../src/data/tuning/scenery.json';
import { PIECES, layoutTown } from '../src/render/stadium/town';
import { readBytes } from './helpers/node.mjs';

describe('the town round the ground', () => {
  it('lays out the same town every time', () => {
    expect(layoutTown(2)).toEqual(layoutTown(2));
  });

  it('builds less of the town on a lower graphics tier', () => {
    const [low, medium, high] = [0, 1, 2].map((d) => layoutTown(d).placements.length);
    expect(low).toBeGreaterThan(100);
    expect(medium).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(medium);
    // A phone on Medium should not be handed a city.
    expect(medium).toBeLessThan(3000);
  });

  it("keeps clear of the ground's own plaza", () => {
    const G = tuning.grid;
    const town = layoutTown(2);
    for (const p of town.placements) {
      // The hills are one ring round everything, centred on the ground.
      if (p.piece === 'hills') continue;
      expect(Math.abs(p.x) > G.plazaHalfX || Math.abs(p.z) > G.plazaHalfZ, `${p.piece} at ${p.x}, ${p.z}`).toBe(true);
    }
    for (const p of town.patches) {
      const inside = p.x0 < G.plazaHalfX - 2 && p.x1 > -G.plazaHalfX + 2 && p.z0 < G.plazaHalfZ - 2 && p.z1 > -G.plazaHalfZ + 2;
      expect(inside, `a patch from ${p.x0}, ${p.z0} to ${p.x1}, ${p.z1}`).toBe(false);
    }
  });

  it('has one church, shops facing the ground and a car park at each end', () => {
    const town = layoutTown(1);
    const count = (piece: string): number => town.placements.filter((p) => p.piece === piece).length;
    expect(count('church')).toBe(1);
    expect(count('shop')).toBeGreaterThan(20);
    expect(count('car')).toBeGreaterThan(60);
  });

  it('puts fields, a skyline, hills and clouds beyond the streets', () => {
    for (const detail of [0, 1, 2]) {
      const town = layoutTown(detail);
      const of = (test: (piece: string) => boolean) => town.placements.filter((p) => test(p.piece));
      expect(of((p) => p === 'hills')).toHaveLength(1);
      const towers = of((p) => p.startsWith('tower_'));
      expect(towers).toHaveLength(tuning.skyline.towers[detail]);
      // The city centre stands outside the streets, and the clouds further out and overhead.
      for (const t of towers) expect(Math.hypot(t.x, t.z)).toBeGreaterThan(town.reach);
      const clouds = of((p) => p === 'cloud');
      expect(clouds).toHaveLength(tuning.clouds.count[detail]);
      for (const c of clouds) {
        expect(c.sky).toBe(true);
        expect(Math.hypot(c.x, c.z)).toBeGreaterThanOrEqual(tuning.clouds.from);
        expect(c.y).toBeGreaterThanOrEqual(tuning.clouds.height[0]);
      }
      // Everything else stands on the ground, in the haze.
      expect(town.placements.filter((p) => p.sky && p.piece !== 'cloud')).toEqual([]);
      const fields = town.patches.filter((p) => (tuning.colours.fields as string[]).includes(p.colour));
      expect(fields.length).toBeGreaterThan(60);
    }
  });

  it("furnishes the ground: dugouts, a tunnel, corner flags, gates and planted trees", () => {
    const G = tuning.grid;
    const F = tuning.ground;
    // The furniture is the same on every tier, and the same every time.
    expect(layoutTown(0).furniture).toEqual(layoutTown(2).furniture);
    const all = layoutTown(1).furniture;
    const of = (piece: string) => all.filter((p) => p.piece === piece);
    expect(of('dugout')).toHaveLength(2);
    expect(of('tunnel')).toHaveLength(1);
    expect(of('corner_flag')).toHaveLength(4);
    expect(of('gate')).toHaveLength(4);
    expect(of('flagpole')).toHaveLength(4 * 2 * F.poles);
    expect(of('planter').length).toBeGreaterThan(20);
    expect(of('tree_round')).toHaveLength(of('planter').length);
    // The home dugout wears the club's colour.
    expect(of('dugout').map((p) => p.a)).toContain('club1');
    for (const p of all) {
      // Everything stands on the plaza...
      expect(Math.abs(p.x) <= G.plazaHalfX && Math.abs(p.z) <= G.plazaHalfZ, `${p.piece} at ${p.x}, ${p.z}`).toBe(true);
      const pitchSide = ['dugout', 'tunnel', 'corner_flag'].includes(p.piece);
      if (pitchSide) {
        // ...the pitch's own pieces off the grass but in front of the stands (40 m from the middle),
        expect(Math.abs(p.z) >= F.pitch[1] && Math.abs(p.z) < 40, `${p.piece} at z ${p.z}`).toBe(true);
      } else {
        // ...and the rest outside the biggest stands, the shop and the floodlights.
        expect(Math.abs(p.x) > 112 || Math.abs(p.z) > 101, `${p.piece} at ${p.x}, ${p.z}`).toBe(true);
      }
    }
  });

  it('only uses pieces that are in scenery.glb', () => {
    // A .glb starts with a 12-byte header, then a JSON chunk: its length, "JSON", the text.
    const bytes: Uint8Array = readBytes('public/assets/stadium/scenery.glb');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as { nodes: { name?: string }[] };
    const inFile = new Set(json.nodes.map((n) => n.name));
    for (const name of PIECES) expect(inFile.has(name), name).toBe(true);
    const town = layoutTown(2);
    for (const p of [...town.placements, ...town.furniture]) expect(PIECES).toContain(p.piece);
  });
});
