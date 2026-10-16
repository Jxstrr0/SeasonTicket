/**
 * The stadium's shape as plain numbers, with no three.js, so it can be unit
 * tested. A stand is a cross-section ("profile") swept along a path: a
 * straight line for the four stands, a quarter circle for a corner.
 *
 * Model space: the pitch runs along x (goal lines at x = ±52.5), its width
 * along z (touchlines at z = ±34), y is up. The Main Stand (west) is on +z,
 * the East Stand on -z, the North End on -x and the South End on +x.
 *
 * A profile lives in (d, y): d is the distance back from the stand's front
 * wall, y the height. Its points go clockwise (front up, over the seats,
 * down the back, along the ground), so a segment from a to b faces
 * (-(b.y - a.y), b.d - a.d): towards the pitch for the front wall, up for a
 * row of seats, out for the back wall.
 */
import type { CornerKey, StandKey } from './types';

export const PITCH = { length: 105, width: 68 };
/** Front line of the side stands (|z|) and the ends (|x|). */
export const SIDE_FRONT = 40;
export const END_FRONT = 60;
/** Half lengths: side stands span x ±55, ends span z ±35. */
export const SIDE_HALF = 55;
export const END_HALF = 35;
/** Radius of a corner's front edge, around the point where the stands' ends meet. */
export const CORNER_R0 = 5;

export type SegKind =
  | 'tread' // a row of seats (the seat texture)
  | 'riser' // the step up to the next row (seat texture, darker)
  | 'wall' // a tier's front wall
  | 'ribbon' // a tier's front wall as an LED advertising ribbon
  | 'glass' // hospitality boxes
  | 'concourse' // the dark gap between tiers
  | 'underside' // the underside of an overhanging tier
  | 'facade' // the outside cladding and tops
  | 'grass' // a grass bank
  | 'ground'; // the base, never drawn

export interface Pt {
  d: number;
  y: number;
}

export interface Seg {
  a: Pt;
  b: Pt;
  kind: SegKind;
  /** Seat row (counted from the front, all tiers) for treads and risers. */
  row?: number;
  /** Tier (0 lowest) for walls and ribbons. */
  tier?: number;
}

export interface Row {
  /** Front and back of the tread, and its height. */
  d0: number;
  d1: number;
  y: number;
  tier: number;
}

export interface Band {
  /** A vertical face (boxes or concourse) at depth d from y0 to y1. */
  d: number;
  y0: number;
  y1: number;
  glass: boolean;
  /** Box rows shown in this band (0 for a concourse). */
  boxRows: number;
}

export interface Profile {
  level: number;
  points: Pt[];
  segs: Seg[];
  rows: Row[];
  bands: Band[];
  /** Back of the stand and the top of its back wall. */
  depth: number;
  height: number;
  /** Fans stand on a grass bank rather than sit. */
  standing: boolean;
}

interface TierSpec {
  wall: number;
  rows: number;
  tread: number;
  rise: number;
}

const LOWER: TierSpec = { wall: 1.3, rows: 20, tread: 0.8, rise: 0.38 };
const BAND = 3.2;
const BAND_TWO_ROWS = 6.7;
const BACK_WALL = 1.2;
const BACK_SKIN = 0.3;

class ProfileBuilder {
  readonly points: Pt[] = [{ d: 0, y: 0 }];
  readonly segs: Seg[] = [];
  readonly rows: Row[] = [];
  readonly bands: Band[] = [];

  get at(): Pt {
    return this.points[this.points.length - 1];
  }

  to(d: number, y: number, kind: SegKind, extra: Partial<Seg> = {}): this {
    const a = this.at;
    const b = { d, y };
    if (Math.abs(a.d - d) < 1e-9 && Math.abs(a.y - y) < 1e-9) return this;
    this.segs.push({ a, b, kind, ...extra });
    this.points.push(b);
    return this;
  }

  /** Rows of seats from the current point; ends at the back of the last tread. */
  tier(spec: TierSpec, tier: number, kindOfWall: SegKind): this {
    this.to(this.at.d, this.at.y + spec.wall, kindOfWall, { tier });
    for (let i = 0; i < spec.rows; i++) {
      const { d, y } = this.at;
      const row = this.rows.length;
      this.rows.push({ d0: d, d1: d + spec.tread, y, tier });
      this.to(d + spec.tread, y, 'tread', { row });
      if (i < spec.rows - 1) this.to(d + spec.tread, y + spec.rise, 'riser', { row });
    }
    return this;
  }

  /** A box or concourse face, then the overhang of the tier above. */
  band(height: number, boxRows: number, overhang: number): this {
    const { d, y } = this.at;
    const glass = boxRows > 0;
    this.bands.push({ d, y0: y, y1: y + height, glass, boxRows });
    this.to(d, y + height, glass ? 'glass' : 'concourse');
    this.to(d - overhang, y + height, 'underside');
    return this;
  }

  /** The back wall above the last row, then down the outside to the ground. */
  close(level: number, standing = false): Profile {
    const { d, y } = this.at;
    this.to(d, y + BACK_WALL, 'facade');
    this.to(d + BACK_SKIN, y + BACK_WALL, 'facade');
    const depth = d + BACK_SKIN;
    const height = y + BACK_WALL;
    this.to(depth, 0, 'facade');
    this.segs.push({ a: this.at, b: this.points[0], kind: 'ground' });
    return { level, points: this.points, segs: this.segs, rows: this.rows, bands: this.bands, depth, height, standing };
  }
}

/**
 * The cross-section of a stand at `level` (0-4) with `boxRows` (0-2) rows of
 * hospitality boxes. `ribbons` turns the upper tiers' front walls into LED
 * ribbons (signage level 2).
 */
export function standProfile(level: number, boxRows: number, ribbons = false): Profile {
  const b = new ProfileBuilder();
  const upperWall: SegKind = ribbons ? 'ribbon' : 'wall';
  switch (Math.max(0, Math.min(4, Math.round(level)))) {
    case 0: {
      // A grass bank with a low wall at the front: fans stand.
      b.to(0, 0.6, 'wall', { tier: 0 });
      const rows = 10;
      for (let i = 0; i < rows; i++) {
        const d0 = i;
        b.rows.push({ d0, d1: d0 + 1, y: 0.6 + (2.6 * (d0 + 0.5)) / 10, tier: 0 });
      }
      b.to(10, 3.2, 'grass');
      b.to(11, 3.2, 'grass');
      b.to(11, 0, 'grass');
      b.segs.push({ a: b.at, b: b.points[0], kind: 'ground' });
      return { level: 0, points: b.points, segs: b.segs, rows: b.rows, bands: [], depth: 11, height: 3.2, standing: true };
    }
    case 1:
      return b.tier({ wall: 1.2, rows: 12, tread: 0.8, rise: 0.32 }, 0, 'wall').close(1);
    case 2: {
      b.tier({ wall: 1.3, rows: 26, tread: 0.8, rise: 0.4 }, 0, 'wall');
      if (boxRows > 0) {
        // A glass box row sits on top of the back of the stand.
        const { d, y } = b.at;
        b.bands.push({ d, y0: y, y1: y + BAND, glass: true, boxRows: 1 });
        b.to(d, y + BAND, 'glass');
        b.to(d + 4, y + BAND, 'facade');
        b.to(d + 4, 0, 'facade');
        b.segs.push({ a: b.at, b: b.points[0], kind: 'ground' });
        return { level: 2, points: b.points, segs: b.segs, rows: b.rows, bands: b.bands, depth: d + 4, height: y + BAND, standing: false };
      }
      return b.close(2);
    }
    case 3: {
      b.tier(LOWER, 0, 'wall');
      b.to(b.at.d, b.at.y + LOWER.rise, 'riser', { row: b.rows.length - 1 });
      b.band(boxRows >= 2 ? BAND_TWO_ROWS : BAND, Math.min(2, boxRows), 5);
      b.tier({ wall: 1.1, rows: 22, tread: 0.85, rise: 0.55 }, 1, upperWall);
      return b.close(3);
    }
    default: {
      b.tier(LOWER, 0, 'wall');
      b.to(b.at.d, b.at.y + LOWER.rise, 'riser', { row: b.rows.length - 1 });
      b.band(BAND, boxRows >= 1 ? 1 : 0, 4);
      const mid = { wall: 1.0, rows: 12, tread: 0.85, rise: 0.5 };
      b.tier(mid, 1, upperWall);
      b.to(b.at.d, b.at.y + mid.rise, 'riser', { row: b.rows.length - 1 });
      b.band(BAND, boxRows >= 2 ? 1 : 0, 4);
      b.tier({ wall: 1.1, rows: 22, tread: 0.9, rise: 0.6 }, 2, upperWall);
      return b.close(4);
    }
  }
}

/** The outward normal of a profile segment, in (d, y). */
export function segNormal(s: Seg): Pt {
  const dd = s.b.d - s.a.d;
  const dy = s.b.y - s.a.y;
  const len = Math.hypot(dd, dy) || 1;
  return { d: -dy / len, y: dd / len };
}

/** Twice the signed area: negative when the points run clockwise. */
export function signedArea(points: Pt[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.d * q.y - q.d * p.y;
  }
  return a;
}

/** A point on a stand's front line, and which way is "back" (away from the pitch). */
export interface PathPoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

/** Where along a path a profile depth lands: front point plus d times the normal. */
export function offset(p: PathPoint, d: number): { x: number; z: number } {
  return { x: p.x + p.nx * d, z: p.z + p.nz * d };
}

/**
 * The front line of a stand, left to right as seen from the pitch. Each
 * stand runs between the corners, so neighbouring stands' end faces meet a
 * corner's edges.
 */
export function standPath(id: StandKey): PathPoint[] {
  switch (id) {
    case 'west':
      return [
        { x: SIDE_HALF, z: SIDE_FRONT, nx: 0, nz: 1 },
        { x: -SIDE_HALF, z: SIDE_FRONT, nx: 0, nz: 1 },
      ];
    case 'east':
      return [
        { x: -SIDE_HALF, z: -SIDE_FRONT, nx: 0, nz: -1 },
        { x: SIDE_HALF, z: -SIDE_FRONT, nx: 0, nz: -1 },
      ];
    case 'north':
      return [
        { x: -END_FRONT, z: END_HALF, nx: -1, nz: 0 },
        { x: -END_FRONT, z: -END_HALF, nx: -1, nz: 0 },
      ];
    case 'south':
      return [
        { x: END_FRONT, z: -END_HALF, nx: 1, nz: 0 },
        { x: END_FRONT, z: END_HALF, nx: 1, nz: 0 },
      ];
  }
}

const CORNER_ARC: Record<CornerKey, { from: number; cx: number; cz: number }> = {
  sw: { from: 0, cx: SIDE_HALF, cz: END_HALF },
  nw: { from: 90, cx: -SIDE_HALF, cz: END_HALF },
  ne: { from: 180, cx: -SIDE_HALF, cz: -END_HALF },
  se: { from: 270, cx: SIDE_HALF, cz: -END_HALF },
};

/** The two stands a corner joins. */
export const CORNER_NEIGHBOURS: Record<CornerKey, [StandKey, StandKey]> = {
  sw: ['south', 'west'],
  nw: ['west', 'north'],
  ne: ['north', 'east'],
  se: ['east', 'south'],
};

/** A corner's front edge as a quarter circle in `steps` pieces. */
export function cornerPath(id: CornerKey, steps: number): PathPoint[] {
  const { from, cx, cz } = CORNER_ARC[id];
  const out: PathPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((from + (90 * i) / steps) * Math.PI) / 180;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    out.push({ x: cx + nx * CORNER_R0, z: cz + nz * CORNER_R0, nx, nz });
  }
  return out;
}

/** The corner's centre (where the two stands' front lines would meet). */
export function cornerCentre(id: CornerKey): { x: number; z: number } {
  const { cx, cz } = CORNER_ARC[id];
  return { x: cx, z: cz };
}

/** Length of a path at depth d (longer towards the back of a corner). */
export function pathLength(path: PathPoint[], d: number): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const a = offset(path[i - 1], d);
    const b = offset(path[i], d);
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return len;
}

/** Arc-length positions (0-1) of a path's points at depth d. */
export function pathStations(path: PathPoint[], d: number): number[] {
  const out = [0];
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const a = offset(path[i - 1], d);
    const b = offset(path[i], d);
    len += Math.hypot(b.x - a.x, b.z - a.z);
    out.push(len);
  }
  return out.map((v) => (len > 0 ? v / len : 0));
}

/** The point a share t (0-1) of the way along a path, at depth d. */
export function pathAt(path: PathPoint[], t: number, d: number): PathPoint & { tx: number; tz: number } {
  const stations = pathStations(path, d);
  let i = 1;
  while (i < path.length - 1 && stations[i] < t) i++;
  const s0 = stations[i - 1];
  const s1 = stations[i];
  const k = s1 > s0 ? Math.max(0, Math.min(1, (t - s0) / (s1 - s0))) : 0;
  const a = path[i - 1];
  const b = path[i];
  const x = a.x + (b.x - a.x) * k;
  const z = a.z + (b.z - a.z) * k;
  let nx = a.nx + (b.nx - a.nx) * k;
  let nz = a.nz + (b.nz - a.nz) * k;
  const nl = Math.hypot(nx, nz) || 1;
  nx /= nl;
  nz /= nl;
  // Tangent: left to right as seen from the pitch.
  const tx = -nz;
  const tz = nx;
  return { x: x + nx * d, z: z + nz * d, nx, nz, tx, tz };
}

/**
 * The profile of the tallest stand a corner can hold: an infill corner (1)
 * matches a single-tier stand, a tall corner (2) a two-tier stand.
 */
export function cornerProfile(level: number, ribbons = false): Profile | null {
  if (level <= 0) return null;
  return standProfile(Math.min(4, level + 1), 0, ribbons);
}

/** Seats along a row, roughly one per 0.5 m. */
export function seatsAlong(length: number): number {
  return Math.max(1, Math.round(length / 0.5));
}

/** Corner arcs get more pieces at higher detail. */
export function cornerSteps(detail: number): number {
  return detail >= 2 ? 16 : detail >= 1 ? 10 : 6;
}
