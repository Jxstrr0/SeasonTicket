/**
 * Lays out the town round the ground: a grid of streets, and on each block between them a
 * row of terraces, detached houses, shops facing the ground, a park, flats, a works, the
 * church or a match-day car park. Pure numbers: scenery.ts turns the result into meshes.
 *
 * The layout is the same for every club and every visit (a fixed seed), and a lower
 * graphics tier builds the same town with fewer blocks, nearest the ground first.
 */
import tuning from '../../data/tuning/scenery.json';

const T = tuning;
const G = T.grid;
const C = T.colours;

/** The pieces in scenery.glb (scripts/assets/scenery-kit.py). */
export const PIECES = [
  'house_terrace', 'house_detached', 'shop', 'flats', 'church', 'works', 'house_far',
  'tree_round', 'tree_tall', 'tree_pine', 'tree_far', 'bush', 'car', 'van', 'lamp',
] as const;
export type PieceName = (typeof PIECES)[number];

/** One piece standing at (x, z), turned `rot` radians about the upright, at height y. */
export interface Placement {
  piece: PieceName;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  /** The colours of its two tinted zones (walls and roof, a car's body, a tree's crown). */
  a: string;
  b: string;
}

/** A flat rectangle of ground at height y. */
export interface Patch {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  colour: string;
}

export interface Town {
  placements: Placement[];
  patches: Patch[];
  /** How far the built town reaches from the centre spot. */
  reach: number;
}

type Kind = 'terraces' | 'detached' | 'park' | 'flats' | 'works' | 'church' | 'shops' | 'carpark';

interface Block {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  dist: number;
  kind: Kind;
}

/** The piece's front (+z as modelled) turned to face along (dx, dz). */
const facing = (dx: number, dz: number): number => Math.atan2(dx, dz);

function streets(plaza: number, inner: number[], block: number, count: number): number[] {
  const out = [-plaza, ...inner.map((v) => -v), ...inner, plaza];
  for (let k = 1; k <= count; k++) out.push(plaza + k * block, -plaza - k * block);
  return out.sort((p, q) => p - q);
}

export function layoutTown(detail: number): Town {
  const tier = Math.min(2, Math.max(0, Math.round(detail)));
  let seed = T.seed;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const pick = <V>(list: readonly V[]): V => list[Math.floor(rand() * list.length) % list.length];
  const between = (lo: number, hi: number): number => lo + rand() * (hi - lo);

  // ---- blocks: every cell of the street grid except the ground's own ----------------
  const xs = streets(G.plazaX, G.innerX, G.blockX, G.countX);
  const zs = streets(G.plazaZ, G.innerZ, G.blockZ, G.countZ);
  const blocks: Block[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      if (Math.abs(cx) < G.plazaX && Math.abs(cz) < G.plazaZ) continue;
      blocks.push({ x0: xs[i], z0: zs[j], x1: xs[i + 1], z1: zs[j + 1], dist: Math.hypot(cx, cz * 1.15), kind: 'terraces' });
    }
  }
  blocks.sort((p, q) => p.dist - q.dist);
  const built = blocks.slice(0, T.tiers.blocks[tier]);
  const near = T.tiers.near[tier];

  // What each block is. The fixed ones first, then the mix.
  const beside = (b: Block): 'side' | 'end' | null => {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    if (Math.abs(cx) < G.plazaX && Math.abs(cz) < G.plazaZ + G.blockZ) return 'side';
    if (Math.abs(cz) < G.plazaZ && Math.abs(cx) < G.plazaX + G.blockX) return 'end';
    return null;
  };
  let church = false;
  const M = T.mix;
  const total = M.terraces + M.detached + M.park + M.flats + M.works;
  for (const b of built) {
    const where = beside(b);
    const cz = (b.z0 + b.z1) / 2;
    if (where === 'end' && Math.abs(cz) < G.innerZ[0]) b.kind = 'carpark';
    else if (where === 'side') b.kind = 'shops';
    else if (!church && where === null && b.dist > 230) {
      b.kind = 'church';
      church = true;
    } else {
      let r = rand() * total;
      if ((r -= M.terraces) < 0) b.kind = 'terraces';
      else if ((r -= M.detached) < 0) b.kind = 'detached';
      else if ((r -= M.park) < 0) b.kind = 'park';
      else if ((r -= M.flats) < 0) b.kind = 'flats';
      else b.kind = b.dist >= M.worksFrom ? 'works' : 'terraces';
    }
  }

  const placements: Placement[] = [];
  const patches: Patch[] = [];
  const L = T.levels;
  const put = (piece: PieceName, x: number, z: number, rot: number, a: string, b = a, scale = 1, y = L.lawn): void => {
    placements.push({ piece, x, y, z, rot, scale, a, b });
  };
  const tree = (x: number, z: number, far: boolean, pine = false): void => {
    const s = between(0.8, 1.25);
    if (far) put('tree_far', x, z, rand() * 6.28, pick(pine ? C.pines : C.leaves), undefined, s);
    else if (pine) put('tree_pine', x, z, rand() * 6.28, pick(C.pines), undefined, s);
    else put(rand() < 0.7 ? 'tree_round' : 'tree_tall', x, z, rand() * 6.28, pick(C.leaves), undefined, s);
  };

  // The ring road's inner half: a frame between the plaza's edge and the first blocks.
  const px = G.plazaHalfX - 1;
  const pz = G.plazaHalfZ - 1;
  for (const s of [-1, 1]) {
    patches.push({ x0: -G.plazaX, z0: Math.min(s * pz, s * G.plazaZ), x1: G.plazaX, z1: Math.max(s * pz, s * G.plazaZ), y: L.road, colour: C.road });
    patches.push({ x0: Math.min(s * px, s * G.plazaX), z0: -pz, x1: Math.max(s * px, s * G.plazaX), z1: pz, y: L.road, colour: C.road });
  }

  built.forEach((b, n) => {
    const far = n >= near;
    const half = G.road / 2;
    patches.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y: L.road, colour: C.road });
    patches.push({ x0: b.x0 + half, z0: b.z0 + half, x1: b.x1 - half, z1: b.z1 - half, y: L.pavement, colour: C.pavement });
    // The plot: the block inside its pavements.
    const x0 = b.x0 + half + G.pavement;
    const x1 = b.x1 - half - G.pavement;
    const z0 = b.z0 + half + G.pavement;
    const z1 = b.z1 - half - G.pavement;
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const ground = b.kind === 'park' ? C.park : b.kind === 'carpark' ? C.road : b.kind === 'works' ? C.yard : pick(C.lawn);
    patches.push({ x0, z0, x1, z1, y: b.kind === 'carpark' ? L.pavement + 0.05 : L.lawn, colour: ground });

    // Rows run along the block's longer side, one down each long edge, fronts to the street.
    const alongX = w >= d;
    const len = alongX ? w : d;
    const depth = alongX ? d : w;
    /** A point `t` along the row and `off` in from edge `side` (-1 or 1), as (x, z). */
    const at = (t: number, side: number, off: number): [number, number] =>
      alongX ? [x0 + t, side < 0 ? z0 + off : z1 - off] : [side < 0 ? x0 + off : x1 - off, z0 + t];
    const front = (side: number): number => (alongX ? facing(0, side) : facing(side, 0));
    /** Which long edge looks at the ground. */
    const inward = alongX ? (cz > 0 ? -1 : 1) : cx > 0 ? -1 : 1;

    const row = (piece: PieceName, side: number, every: number, pieceDepth: number, walls: readonly string[], roofs: readonly string[]): void => {
      const count = Math.floor((len - 2) / every);
      const start = (len - count * every) / 2 + every / 2;
      const rowWall = pick(walls);
      const rowRoof = pick(roofs);
      for (let i = 0; i < count; i++) {
        const [x, z] = at(start + i * every, side, T.houses.setback + pieceDepth / 2);
        const wall = rand() < T.houses.rowSameColour ? rowWall : pick(walls);
        put(far && piece !== 'shop' ? 'house_far' : piece, x, z, front(side), wall, piece === 'shop' ? pick(C.awnings) : rowRoof);
      }
    };
    const gardens = (share: number): void => {
      // Trees and bushes down the middle, behind the houses.
      const count = Math.round((len / 14) * share);
      for (let i = 0; i < count; i++) {
        const t = between(4, len - 4);
        const [x, z] = at(t, -1, depth / 2 + between(-3, 3));
        if (!far && rand() < 0.3) put('bush', x, z, rand() * 6.28, pick(C.leaves), undefined, between(0.9, 1.4));
        else tree(x, z, far, rand() < 0.15);
      }
    };

    switch (b.kind) {
      case 'terraces': {
        const two = depth >= 34;
        row('house_terrace', -1, T.houses.terraceWidth, 9, C.walls, C.roofs);
        if (two) row('house_terrace', 1, T.houses.terraceWidth, 9, C.walls, C.roofs);
        gardens(two ? 0.8 : 0.4);
        break;
      }
      case 'detached': {
        row('house_detached', -1, T.houses.detachedEvery, 8, C.walls, C.roofs);
        if (depth >= 30) row('house_detached', 1, T.houses.detachedEvery, 8, C.walls, C.roofs);
        gardens(1.6);
        break;
      }
      case 'shops': {
        row('shop', inward, T.houses.shopWidth, 11, C.walls, C.roofs);
        if (depth >= 36) row('house_terrace', -inward, T.houses.terraceWidth, 9, C.walls, C.roofs);
        gardens(0.3);
        break;
      }
      case 'park': {
        const count = Math.round((w * d) / 190);
        for (let i = 0; i < count; i++) tree(between(x0 + 3, x1 - 3), between(z0 + 3, z1 - 3), far, rand() < 0.3);
        if (!far) for (let i = 0; i < 6; i++) put('bush', between(x0 + 3, x1 - 3), between(z0 + 3, z1 - 3), rand() * 6.28, pick(C.leaves), undefined, between(0.9, 1.5));
        break;
      }
      case 'flats': {
        const count = Math.max(1, Math.floor(len / 34));
        const wall = pick(C.flats);
        for (let i = 0; i < count; i++) {
          const [x, z] = at((len / count) * (i + 0.5), -1, depth / 2);
          put('flats', x, z, front(inward), wall, wall, between(0.85, 1.1));
        }
        for (let i = 0; i < 6; i++) {
          const [x, z] = at(between(3, len - 3), rand() < 0.5 ? -1 : 1, between(2, 5));
          tree(x, z, far);
        }
        break;
      }
      case 'works': {
        const count = len >= 68 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const [x, z] = at((len / count) * (i + 0.5) - 2, -1, depth / 2);
          put('works', x, z, front(inward), pick(C.works), pick(C.roofs));
        }
        if (!far) for (let i = 0; i < 4; i++) {
          const [x, z] = at(between(6, len - 6), inward, 3);
          put('van', x, z, alongX ? 0 : Math.PI / 2, pick(C.cars), undefined, 1, L.lawn);
        }
        break;
      }
      case 'church': {
        put('church', cx, cz, front(inward), '#ffffff', pick(C.roofs));
        for (let i = 0; i < 12; i++) {
          const [x, z] = at(between(3, len - 3), rand() < 0.5 ? -1 : 1, between(2, 6));
          tree(x, z, far, rand() < 0.5);
        }
        break;
      }
      case 'carpark': {
        // Rows of bays across the plot, in pairs nose to nose with an aisle between.
        const P = T.parking;
        const full = between(P.full[0], P.full[1]);
        const y = L.pavement + 0.05;
        const pairs = Math.floor((len - 6) / (P.row * 2 + P.aisle));
        const bays = Math.floor((depth - 8) / P.bay);
        const startT = (len - pairs * (P.row * 2 + P.aisle) + P.aisle) / 2;
        const startOff = (depth - bays * P.bay) / 2 + P.bay / 2;
        for (let p = 0; p < pairs; p++) {
          for (const k of [0, 1]) {
            const t = startT + p * (P.row * 2 + P.aisle) + P.row * (k + 0.5);
            for (let i = 0; i < bays; i++) {
              if (rand() > full) continue;
              const [x, z] = at(t, -1, startOff + i * P.bay);
              // Noses towards the row they back onto, along the row's direction.
              const rot = (alongX ? 0 : -Math.PI / 2) + (k === 0 ? Math.PI : 0);
              put(rand() < 0.08 ? 'van' : 'car', x, z, rot, pick(C.cars), undefined, 1, y);
            }
          }
        }
        if (!far) for (const side of [-1, 1]) {
          for (let t = 6; t < len; t += 22) {
            const [x, z] = at(t, side, 1.5);
            put('lamp', x, z, front(-side), C.lamp, undefined, 1, y);
          }
        }
        break;
      }
    }

    // On High, a few cars parked along the kerb of the nearer streets.
    if (T.tiers.streetCars[tier] && !far && b.kind !== 'carpark' && b.kind !== 'park') {
      for (const side of [-1, 1]) {
        for (let t = 8; t < len - 8; t += 6.5) {
          if (rand() > 0.3) continue;
          const [x, z] = at(t, side, -G.pavement - 1.1);
          put('car', x, z, alongX ? (side < 0 ? 0 : Math.PI) : side < 0 ? Math.PI / 2 : -Math.PI / 2, pick(C.cars), undefined, 1, L.road);
        }
      }
    }
  });

  const reach = built.reduce((m, b) => Math.max(m, Math.hypot(Math.max(Math.abs(b.x0), Math.abs(b.x1)), Math.max(Math.abs(b.z0), Math.abs(b.z1)))), 0);
  return { placements, patches, reach };
}
