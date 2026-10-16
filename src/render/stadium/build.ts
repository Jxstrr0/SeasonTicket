/**
 * Geometry helpers for the stadium: sweeping a stand's cross-section along
 * its path, end walls, roofs, scaffolding and cranes. Everything goes into
 * GeoBuilders, one per material, so a stand is a few draw calls.
 */
import { GeoBuilder, type V3 } from './geo';
import { offset, pathAt, pathStations, segNormal, type PathPoint, type Profile, type Pt, type Seg } from './layout';

export type Get = (name: string) => GeoBuilder;

/** A world point a share t along a path, at depth d and height y. */
export function at(path: PathPoint[], t: number, d: number, y: number): V3 {
  const p = pathAt(path, t, d);
  return [p.x, y, p.z];
}

/** Running length of a path at depth d, at each of its points. */
function running(path: PathPoint[], d: number): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) {
    const a = offset(path[i - 1], d);
    const b = offset(path[i], d);
    out.push(out[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return out;
}

/** The highest point of a profile's surface at depth d (for roof columns). */
export function heightAt(profile: Profile, d: number): number {
  let y = 0;
  for (const s of profile.segs) {
    if (s.kind === 'ground') continue;
    const d0 = Math.min(s.a.d, s.b.d);
    const d1 = Math.max(s.a.d, s.b.d);
    if (d < d0 - 1e-6 || d > d1 + 1e-6) continue;
    const k = d1 - d0 > 1e-6 ? (d - s.a.d) / (s.b.d - s.a.d) : 1;
    y = Math.max(y, d1 - d0 > 1e-6 ? s.a.y + (s.b.y - s.a.y) * k : Math.max(s.a.y, s.b.y));
  }
  return y;
}

type UV = [number, number];

/**
 * Sweeps profile segments along a path. `route` names the builder for each
 * segment (null skips it). UVs: seats and glass span the stand left to right
 * (u 0-1) and the rows bottom to top; cladding is in metres (8 m by 40 m per
 * tile); ribbons repeat every 48 m.
 */
export function sweep(get: Get, segs: Seg[], path: PathPoint[], rows: number, route: (seg: Seg) => string | null): void {
  const stations = pathStations(path, 0);
  const R = Math.max(1, rows);
  for (const seg of segs) {
    if (seg.kind === 'ground') continue;
    const name = route(seg);
    if (!name) continue;
    const g = get(name);
    const n2 = segNormal(seg);
    const la = running(path, seg.a.d);
    const lb = running(path, seg.b.d);
    const flat = Math.abs(seg.b.y - seg.a.y) < 1e-6;
    const shade = seg.kind === 'riser' ? 0.72 : seg.kind === 'underside' ? 0.6 : 1;
    const r = seg.row ?? 0;
    let vA = 0;
    let vB = 1;
    if (seg.kind === 'tread') {
      vA = (r + 0.25) / R;
      vB = (r + 1) / R;
    } else if (seg.kind === 'riser') {
      vA = (r + 1) / R;
      vB = Math.min(1, (r + 1.25) / R);
    } else if (seg.kind === 'facade') {
      vA = flat ? 0.995 : seg.a.y / 40;
      vB = flat ? 0.995 : seg.b.y / 40;
    } else if (seg.kind !== 'glass' && seg.kind !== 'ribbon') {
      vA = (seg.a.d + seg.a.y) / 4;
      vB = (seg.b.d + seg.b.y) / 4;
    }
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[i];
      const p1 = path[i + 1];
      const A0 = offset(p0, seg.a.d);
      const A1 = offset(p1, seg.a.d);
      const B0 = offset(p0, seg.b.d);
      const B1 = offset(p1, seg.b.d);
      const n0: V3 = [p0.nx * n2.d, n2.y, p0.nz * n2.d];
      const n1: V3 = [p1.nx * n2.d, n2.y, p1.nz * n2.d];
      let u: [number, number, number, number];
      switch (seg.kind) {
        case 'tread':
        case 'riser':
        case 'glass':
          u = [stations[i], stations[i + 1], stations[i], stations[i + 1]];
          break;
        case 'ribbon':
          u = [la[i] / 48, la[i + 1] / 48, lb[i] / 48, lb[i + 1] / 48];
          break;
        case 'facade':
          u = [la[i] / 8, la[i + 1] / 8, lb[i] / 8, lb[i + 1] / 8];
          break;
        default:
          u = [la[i] / 4, la[i + 1] / 4, lb[i] / 4, lb[i + 1] / 4];
      }
      const uv: [UV, UV, UV, UV] = [
        [u[0], vA],
        [u[1], vA],
        [u[3], vB],
        [u[2], vB],
      ];
      g.quad([A0.x, seg.a.y, A0.z], [A1.x, seg.a.y, A1.z], [B1.x, seg.b.y, B1.z], [B0.x, seg.b.y, B0.z], [n0, n1, n1, n0], uv, shade);
    }
  }
}

/** End walls: the profile's outline at both ends of the path, facing outwards. */
export function caps(g: GeoBuilder, points: Pt[], path: PathPoint[]): void {
  const ends: [PathPoint, number][] = [
    [path[0], -1],
    [path[path.length - 1], 1],
  ];
  for (const [p, sign] of ends) {
    const n: V3 = [-p.nz * sign, 0, p.nx * sign];
    g.polygon(
      points.map((q) => ({ x: q.d, y: q.y })),
      (d, y) => {
        const o = offset(p, d);
        return [o.x, y, o.z];
      },
      n,
      (d, y) => [d / 8, y / 40],
    );
  }
}

export interface RoofShape {
  dFront: number;
  dBack: number;
  yFront: number;
  yBack: number;
  segs: Seg[];
  points: Pt[];
}

/** A roof over a stand: 1 covers the back half, 2 the whole stand and a little more. */
export function roofShape(profile: Profile, level: number): RoofShape {
  const dBack = profile.depth + 0.5;
  const dFront = level >= 2 ? -1.5 : Math.round(profile.depth / 2);
  const yBack = profile.height + 3.5;
  const yFront = profile.height + (level >= 2 ? 5 : 4.5);
  const points: Pt[] = [
    { d: dFront, y: yFront },
    { d: dBack, y: yBack },
    { d: dBack, y: yBack - 1.5 },
    { d: dFront, y: yFront - 0.6 },
  ];
  const segs: Seg[] = [
    { a: points[0], b: points[1], kind: 'facade' },
    { a: points[1], b: points[2], kind: 'facade' },
    { a: points[2], b: points[3], kind: 'underside' },
    { a: points[3], b: points[0], kind: 'wall' },
  ];
  return { dFront, dBack, yFront, yBack, segs, points };
}

/** Evenly spaced shares along a path, about `every` metres apart, ends included. */
export function spaced(length: number, every: number, inset = 0): number[] {
  const n = Math.max(1, Math.round(length / every));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(inset + ((1 - 2 * inset) * i) / n);
  return out;
}

/**
 * The roof: cladding swept along the path, its front fascia, posts at the
 * back, columns under a part roof, and trusses on a full roof.
 */
export function roof(get: Get, profile: Profile, path: PathPoint[], level: number, length: number, detail: number): RoofShape {
  const r = roofShape(profile, level);
  sweep(get, r.segs, path, 1, (s) => (s.kind === 'wall' ? 'fascia' : 'roof'));
  caps(get('roof'), r.points, path);
  const steel = get('steel');
  for (const t of spaced(length, 10, 0.01)) {
    steel.beam(at(path, t, profile.depth + 0.2, 0), at(path, t, profile.depth + 0.2, r.yBack - 0.75), 0.5);
  }
  if (level < 2) {
    const base = heightAt(profile, r.dFront + 0.4);
    for (const t of spaced(length, 12, 0.04)) steel.beam(at(path, t, r.dFront + 0.4, base), at(path, t, r.dFront + 0.4, r.yFront - 0.6), 0.35);
  } else if (detail >= 1) {
    for (const t of spaced(length, 10, 0.01)) {
      const top = at(path, t, r.dBack - 0.6, r.yBack + 4);
      steel.beam(at(path, t, r.dBack - 0.6, r.yBack), top, 0.45);
      steel.beam(top, at(path, t, r.dFront + 1.5, r.yFront + 0.1), 0.3);
      steel.beam(top, at(path, t, (r.dFront + r.dBack) / 2, r.yFront - 0.1 + (r.yBack - r.yFront) / 2), 0.25);
    }
  }
  return r;
}

/** The outline of a profile without the individual seat rows. */
export function outline(profile: Profile): Pt[] {
  const out: Pt[] = [profile.points[0]];
  const segs = profile.segs.filter((s) => s.kind !== 'ground');
  segs.forEach((s, i) => {
    const next = segs[i + 1];
    const seating = (k: Seg['kind'] | undefined): boolean => k === 'tread' || k === 'riser';
    if (!next || !(seating(s.kind) && seating(next.kind))) out.push(s.b);
  });
  return out;
}

/**
 * Scaffolding for a stand going up: ribs in the new stand's shape every
 * 8 m, as far along as the work has got, tied together at the top.
 */
export function scaffold(g: GeoBuilder, profile: Profile, path: PathPoint[], length: number, progress: number): void {
  const pts = outline(profile);
  const ts = spaced(length, 8, 0.02).filter((t, i) => i === 0 || t <= Math.max(0.05, progress) + 1e-6);
  let prev: V3[] | null = null;
  for (const t of ts) {
    const rib = pts.map((p) => at(path, t, p.d, p.y));
    for (let i = 1; i < rib.length; i++) g.beam(rib[i - 1], rib[i], 0.22);
    pts.forEach((p, i) => {
      if (p.y > 0.5 && i % 2 === 0) g.beam(rib[i], at(path, t, p.d, 0), 0.18);
    });
    if (prev) for (let i = 0; i < rib.length; i += 3) g.beam(prev[i], rib[i], 0.15);
    prev = rib;
  }
}

/** A tower crane's mast (with lattice at higher detail). */
export function craneMast(g: GeoBuilder, height: number, detail: number): void {
  const w = 1.6;
  if (detail < 1) {
    g.beam([0, 0, 0], [0, height, 0], w);
  } else {
    const h = w / 2;
    const posts: [number, number][] = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
    for (const [x, z] of posts) g.beam([x, 0, z], [x, height, z], 0.16);
    for (let y = 2.5; y < height; y += 2.5) {
      for (let i = 0; i < 4; i++) {
        const [x0, z0] = posts[i];
        const [x1, z1] = posts[(i + 1) % 4];
        g.beam([x0, y, z0], [x1, y - 2.5, z1], 0.08);
        g.beam([x0, y, z0], [x1, y, z1], 0.08);
      }
    }
  }
  g.box(0, 0.5, 0, 4, 1, 4);
}

/** The turning part of a crane, built along +x from the top of the mast. */
export function craneJib(g: GeoBuilder, cable: GeoBuilder, jib: number, counter: number, hookAt: number, drop: number): void {
  g.beam([-counter, 0.6, 0], [jib, 0.6, 0], 1.1, 1.2);
  g.beam([0, 0, 0], [0, 6, 0], 1);
  g.beam([0, 6, 0], [jib * 0.6, 1.2, 0], 0.12);
  g.beam([0, 6, 0], [-counter, 1.2, 0], 0.12);
  g.box(-counter + 2, -0.6, 0, 4, 2.4, 2.2);
  g.box(1.8, -0.4, 1.4, 2.2, 2, 1.8);
  g.box(hookAt, 0.0, 0, 1.4, 0.6, 1.4);
  cable.beam([hookAt, 0, 0], [hookAt, -drop, 0], 0.06);
  g.box(hookAt, -drop - 0.3, 0, 0.6, 0.6, 0.6);
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * A box facing `fwd`: its front face (w by h) goes to `front` with UVs that
 * read left to right for someone looking at it; the rest goes to `back`.
 */
export function panel(front: GeoBuilder, back: GeoBuilder, c: V3, fwd: V3, w: number, h: number, depth: number): void {
  const f = unit(fwd);
  const right = unit(Math.abs(f[1]) > 0.99 ? [1, 0, 0] : cross([0, 1, 0], f));
  const up = cross(f, right);
  const p = (i: number, j: number, k: number): V3 => add(add(add(c, mul(right, (i * w) / 2)), mul(up, (j * h) / 2)), mul(f, (k * depth) / 2));
  front.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), f, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);
  const nf = mul(f, -1);
  back.quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), nf);
  back.quad(p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1), up);
  back.quad(p(-1, -1, 1), p(1, -1, 1), p(1, -1, -1), p(-1, -1, -1), mul(up, -1));
  back.quad(p(1, -1, 1), p(1, 1, 1), p(1, 1, -1), p(1, -1, -1), right);
  back.quad(p(-1, -1, -1), p(-1, 1, -1), p(-1, 1, 1), p(-1, -1, 1), mul(right, -1));
}

/**
 * A vertical strip from a to b (x, z) between heights y0 and y1, facing n.
 * u runs from u0 to u1 left to right as seen by someone it faces.
 */
export function strip(g: GeoBuilder, a: [number, number], b: [number, number], y0: number, y1: number, n: V3, u0: number, u1: number): void {
  const right = cross([0, 1, 0], n);
  const forward = (b[0] - a[0]) * right[0] + (b[1] - a[1]) * right[2] >= 0;
  const [l, r] = forward ? [a, b] : [b, a];
  g.quad([l[0], y0, l[1]], [r[0], y0, r[1]], [r[0], y1, r[1]], [l[0], y1, l[1]], n, [
    [u0, 0],
    [u1, 0],
    [u1, 1],
    [u0, 1],
  ]);
}

export { sub };
