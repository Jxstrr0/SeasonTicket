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
    expect(medium).toBeLessThan(2500);
  });

  it("keeps clear of the ground's own plaza", () => {
    const G = tuning.grid;
    const town = layoutTown(2);
    for (const p of town.placements) {
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

  it('only uses pieces that are in scenery.glb', () => {
    // A .glb starts with a 12-byte header, then a JSON chunk: its length, "JSON", the text.
    const bytes: Uint8Array = readBytes('public/assets/stadium/scenery.glb');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as { nodes: { name?: string }[] };
    const inFile = new Set(json.nodes.map((n) => n.name));
    for (const name of PIECES) expect(inFile.has(name), name).toBe(true);
    for (const p of layoutTown(2).placements) expect(PIECES).toContain(p.piece);
  });
});
