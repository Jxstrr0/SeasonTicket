/**
 * The 3D stadium, built from a StadiumSnapshot: four stands and their
 * corners, roofs, hospitality boxes, floodlights, video boards, signage, the
 * club shop, concourse extras, the pitch, building work and the crowd.
 *
 * The model is split into bins (one per stand, the corners, the pitch, the
 * extras, the works and the crowd). `update` rebuilds a bin only when the
 * part of the snapshot it draws has changed, so buying a roof rebuilds one
 * stand, not the ground. Used both outside the office window (night, far
 * away) and on the Stadium tab (day, close up, tappable).
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type MeshBasicMaterialParameters,
  type MeshLambertMaterialParameters,
  type Object3D,
} from 'three';
import tuning from '../../data/tuning/stadium.json';
import type { TierSettings } from '../quality';
import { ScreenTexture } from '../office/screens';
import { GeoBuilder } from './geo';
import { caps, craneJib, craneMast, panel, roof, roofShape, scaffold, strip, sweep, type Get } from './build';
import {
  CORNER_NEIGHBOURS,
  END_FRONT,
  SIDE_FRONT,
  cornerCentre,
  cornerPath,
  cornerProfile,
  cornerSteps,
  crowdFigures,
  offset,
  pathAt,
  pathLength,
  seatsAlong,
  standPath,
  standProfile,
  type PathPoint,
  type Profile,
  type Seg,
} from './layout';
import {
  GRASS,
  adsTexture,
  claddingTexture,
  glassTexture,
  hoardingTexture,
  loadSvg,
  paintAds,
  paintBoard,
  paintPitch,
  pitchTexture,
  seatTexture,
  signTexture,
  windowGlowTexture,
} from './textures';
import { CORNER_KEYS, STAND_KEYS, type CornerKey, type StadiumPart, type StadiumSnapshot, type StadiumWork, type StandKey } from './types';

export interface StadiumModelOptions {
  /** Most fans to draw (they are instanced boxes). */
  crowdCap: number;
  /** 0-1: how much the stadium lights itself (high at night from the office, low in daylight). */
  selfLit: number;
  /** Called when something changes on its own, such as the crest finishing loading. */
  onDirty?: () => void;
  anisotropy?: number;
  shadows?: boolean;
  /** Scroll LED boards and swing cranes; `tick` then reports movement. */
  animate?: boolean;
}

export interface StadiumModel {
  root: Group;
  update(snap: StadiumSnapshot): void;
  /** Highlights a part (null clears). */
  select(part: StadiumPart | null): void;
  /** Changes how much the stadium lights itself (0 daylight, 1 a floodlit night). */
  setLit(selfLit: number): void;
  /** Advances animation; true while something moves (keep drawing). */
  tick(dt: number): boolean;
  /** Objects a tap can hit; pass a hit to `partOf`. */
  hits(): Object3D[];
  dispose(): void;
}

/** Which part of the stadium an object belongs to, or null. */
export function partOf(obj: Object3D | null): StadiumPart | null {
  for (let o = obj; o; o = o.parent) {
    const part = o.userData.part as StadiumPart | undefined;
    if (part) return part;
  }
  return null;
}

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const DIAG = Math.SQRT1_2;
/** Mesh names that cast shadows (everything receives them). */
const CASTS = new Set(['seats', 'wall', 'ribbon', 'glass', 'concourse', 'underside', 'facade', 'grass', 'roof', 'fascia', 'steel', 'crane', 'scaffold', 'dark', 'shopWall', 'kiosk', 'canopy']);
const BOXES = tuning.boxes;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function xorshift(seed: number): () => number {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

type Disposable = { dispose(): void };

/** One rebuildable piece of the stadium. */
class Bin {
  readonly group = new Group();
  key: string | null = null;
  /** Materials whose glow follows the floodlights. */
  glow: MeshLambertMaterial[] = [];
  /** Box windows, lit from inside. */
  glass: MeshLambertMaterial[] = [];
  private owned: Disposable[] = [];

  constructor(parent: Group, part: StadiumPart | null, name: string) {
    this.group.name = name;
    if (part) this.group.userData.part = part;
    parent.add(this.group);
  }

  own<T extends Disposable>(x: T): T {
    this.owned.push(x);
    return x;
  }

  mesh(geo: BufferGeometry, mat: Material, parent: Object3D = this.group): Mesh {
    this.own(geo);
    const m = new Mesh(geo, mat);
    parent.add(m);
    return m;
  }

  clear(): void {
    this.group.clear();
    for (const o of this.owned) o.dispose();
    this.owned = [];
    this.glow = [];
    this.glass = [];
    this.key = null;
  }
}

/** Geometry builders by material name, flushed into meshes. */
class Builders {
  private readonly map = new Map<string, GeoBuilder>();

  readonly get: Get = (name) => {
    let g = this.map.get(name);
    if (!g) {
      g = new GeoBuilder();
      this.map.set(name, g);
    }
    return g;
  };

  flush(bin: Bin, parent: Object3D, mat: (name: string) => Material | undefined, shadows: boolean): void {
    for (const [name, g] of this.map) {
      const geo = g.build();
      if (!geo) continue;
      const m = mat(name);
      if (!m) {
        geo.dispose();
        continue;
      }
      const mesh = bin.mesh(geo, m, parent);
      mesh.name = name;
      if (shadows) {
        mesh.castShadow = CASTS.has(name);
        mesh.receiveShadow = true;
      }
    }
    this.map.clear();
  }
}

interface Crane {
  jib: Group;
  base: number;
  phase: number;
}

const lambert = (color: string, extra: MeshLambertMaterialParameters = {}): MeshLambertMaterial => new MeshLambertMaterial({ color, vertexColors: true, ...extra });
const basic = (color: string, extra: MeshBasicMaterialParameters = {}): MeshBasicMaterial => new MeshBasicMaterial({ color, vertexColors: true, ...extra });

/** Which builder each profile segment goes to; seats are skipped on a grass bank. */
function route(s: Seg, standing: boolean): string | null {
  switch (s.kind) {
    case 'tread':
    case 'riser':
      return standing ? null : 'seats';
    case 'ground':
      return null;
    default:
      return s.kind;
  }
}

/** A roof's outline dressed as a profile, so the scaffolding helper can follow it. */
function roofProfile(base: Profile, level: number): Profile {
  const r = roofShape(base, level);
  return { ...base, points: r.points, segs: r.segs, height: r.yFront };
}

/** A two-sided site fence along a path at depth d. */
function fence(g: GeoBuilder, path: PathPoint[], d: number, height: number): void {
  let run = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = offset(path[i], d);
    const b = offset(path[i + 1], d);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const nx = (path[i].nx + path[i + 1].nx) / 2;
    const nz = (path[i].nz + path[i + 1].nz) / 2;
    const u0 = run / 38;
    const u1 = (run + len) / 38;
    strip(g, [a.x, a.z], [b.x, b.z], 0, height, [nx, 0, nz], u0, u1);
    strip(g, [a.x, a.z], [b.x, b.z], 0, height, [-nx, 0, -nz], u0, u1);
    run += len;
  }
}

/**
 * A banner hung over a stand's front wall, facing the pitch, so work booked for
 * the off-season shows from the pitch-side cameras as well as from behind.
 */
function frontBanner(g: GeoBuilder, path: PathPoint[]): void {
  let run = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = offset(path[i], -0.08);
    const b = offset(path[i + 1], -0.08);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const nx = (path[i].nx + path[i + 1].nx) / 2;
    const nz = (path[i].nz + path[i + 1].nz) / 2;
    // As tall as the hoarding behind, so the lettering keeps its shape.
    strip(g, [a.x, a.z], [b.x, b.z], 0.1, 2.5, [-nx, 0, -nz], run / 38, (run + len) / 38);
    run += len;
  }
}

/** A square of fence round a point (paid-for upgrade work waiting for the off-season). */
function fenceSquare(g: GeoBuilder, x: number, z: number, half: number): void {
  const c: [number, number][] = [
    [x - half, z - half],
    [x + half, z - half],
    [x + half, z + half],
    [x - half, z + half],
  ];
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    const nx = (b[1] - a[1]) / (2 * half);
    const nz = -(b[0] - a[0]) / (2 * half);
    strip(g, a, b, 0, 2.4, [nx, 0, nz], 0, (2 * half) / 38);
    strip(g, a, b, 0, 2.4, [-nx, 0, -nz], 0, (2 * half) / 38);
  }
}

export function buildStadiumModel(tier: TierSettings, opts: StadiumModelOptions): StadiumModel {
  const detail = tier.detail;
  const aniso = opts.anisotropy ?? 4;
  const shadows = opts.shadows ?? false;
  const animate = opts.animate ?? false;
  const dirty = (): void => opts.onDirty?.();
  let lit = opts.selfLit;

  const root = new Group();
  root.name = 'stadium';

  // Shared textures, repainted when their inputs change.
  const ads = adsTexture(aniso);
  const board = new ScreenTexture(512, 288, aniso);
  const pitchTex = pitchTexture(aniso);
  const cladding = claddingTexture(aniso);
  const windows = windowGlowTexture(aniso);
  let hoarding: ScreenTexture | null = null;
  let sign: ScreenTexture | null = null;

  const M = {
    wall: lambert('#444444'),
    ribbon: basic('#ffffff', { map: ads.texture }),
    concourse: lambert('#22252b'),
    underside: lambert('#3a3d44'),
    facade: lambert('#d4d6da', { map: cladding.texture, emissiveMap: windows.texture, emissive: '#000000' }),
    grass: lambert('#4c7a3a'),
    roof: lambert('#e9ecef'),
    fascia: lambert('#3b3f46', { emissive: '#000000' }),
    steel: lambert('#9aa0a8'),
    crane: lambert('#e8b021'),
    cable: lambert('#1d1f24'),
    scaffold: lambert('#b9bec6'),
    dark: lambert('#2b2e35'),
    white: lambert('#f4f4f4'),
    plaza: lambert('#5d6068'),
    bowl: lambert('#2f5a2a', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    pitch: lambert('#ffffff', {
      map: pitchTex.texture,
      emissiveMap: pitchTex.texture,
      emissive: '#ffffff',
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -8,
    }),
    screen: basic('#ffffff', { map: board.texture }),
    lamp: basic('#fff8e6'),
    // Painted boards pick up the floodlights at night (see applyLook).
    adsPaint: lambert('#ffffff', { map: ads.texture, emissiveMap: ads.texture, emissive: '#ffffff', emissiveIntensity: 0 }),
    adsLed: basic('#ffffff', { map: ads.texture }),
    hoarding: lambert('#ffffff'),
    sign: basic('#ffffff'),
    kiosk: lambert('#888888'),
    awning: lambert('#888888'),
    canopy: basic('#888888'),
    shopWall: lambert('#2f333a'),
    shopGlass: lambert('#1c2836', { emissive: '#ffcf8a' }),
  };
  const shared = M as Record<string, Material>;

  // Fans: instanced boxes whose own colour glows a little at night.
  const glowUniform = { value: 0 };
  const crowdMat = new MeshLambertMaterial({ color: '#ffffff' });
  crowdMat.onBeforeCompile = (shader) => {
    shader.uniforms.crowdGlow = glowUniform;
    shader.fragmentShader = `uniform float crowdGlow;\n${shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * crowdGlow;',
    )}`;
  };
  crowdMat.customProgramCacheKey = () => 'stadium-crowd';
  const bodyGeo = new BoxGeometry(0.46, 0.62, 0.32);
  const headGeo = new BoxGeometry(0.22, 0.22, 0.22);

  const highlight = new MeshBasicMaterial({
    color: '#ffd54a',
    transparent: true,
    opacity: 0.3,
    blending: AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });

  const base = new Bin(root, null, 'base');
  const pitchBin = new Bin(root, 'ground', 'pitch');
  const extras = new Bin(root, 'ground', 'extras');
  const stands = Object.fromEntries(STAND_KEYS.map((id) => [id, new Bin(root, id, `stand-${id}`)])) as Record<StandKey, Bin>;
  const corners = new Bin(root, 'corners', 'corners');
  const works = new Bin(root, null, 'works');
  const crowd = new Bin(root, null, 'crowd');
  const bins = [base, pitchBin, extras, ...Object.values(stands), corners, works, crowd];

  let snap: StadiumSnapshot | null = null;
  let cranes: Crane[] = [];
  let selected: StadiumPart | null = null;
  let overlays: Mesh[] = [];
  let time = 0;
  let disposed = false;
  let adsKey = '';
  let boardKey = '';
  let brandKey = '';
  let pitchKey = '';
  let crestSrc = '';
  let crestImg: HTMLImageElement | null = null;

  const ribbonsOn = (s: StadiumSnapshot): boolean => s.upgrades.signage >= 2;
  const profileOf = (s: StadiumSnapshot, id: StandKey): Profile => standProfile(s.stands[id].level, s.stands[id].boxRows, ribbonsOn(s));
  const hasRoof = (s: StadiumSnapshot, id: StandKey): boolean => s.stands[id].roof > 0 && s.stands[id].level >= 1;
  /** Top of a stand, roof included. */
  const topOf = (s: StadiumSnapshot, id: StandKey, p: Profile): number => (hasRoof(s, id) ? roofShape(p, s.stands[id].roof).yFront : p.height);
  const cornerRoof = (s: StadiumSnapshot, c: CornerKey): number => {
    const [a, b] = CORNER_NEIGHBOURS[c];
    return Math.min(hasRoof(s, a) ? s.stands[a].roof : 0, hasRoof(s, b) ? s.stands[b].roof : 0);
  };
  const activePitchWork = (s: StadiumSnapshot): StadiumWork | undefined => s.works.find((w) => w.kind === 'upgrade' && w.target === 'pitch' && !w.queued);

  // ---- Stands and corners -------------------------------------------------

  function seatMaterial(bin: Bin, s: StadiumSnapshot, p: Profile, length: number, closed: number, initials: boolean): MeshLambertMaterial {
    const tex = bin.own(
      seatTexture(
        {
          length,
          rows: p.rows.length,
          lowerRows: p.rows.filter((r) => r.tier === 0).length,
          scheme: s.look.seats,
          primary: s.primary,
          secondary: s.secondary,
          abbr: s.abbr,
          closed,
          initials,
        },
        aniso,
      ),
    );
    const m = bin.own(lambert('#ffffff', { map: tex.texture, emissiveMap: tex.texture, emissive: '#ffffff' }));
    bin.glow.push(m);
    return m;
  }

  function buildStand(id: StandKey, s: StadiumSnapshot): void {
    const bin = stands[id];
    const st = s.stands[id];
    const p = profileOf(s, id);
    const path = standPath(id);
    const length = pathLength(path, 0);
    const B = new Builders();
    sweep(B.get, p.segs, path, p.rows.length, (seg) => route(seg, p.standing));
    caps(B.get(p.standing ? 'grass' : 'facade'), p.points, path);
    if (hasRoof(s, id)) roof(B.get, p, path, st.roof, length, detail);
    const seats = p.standing ? undefined : seatMaterial(bin, s, p, length, s.closed[id] ?? 0, true);
    let glass: MeshLambertMaterial | undefined;
    const rows = Math.max(0, ...p.bands.map((b) => b.boxRows));
    if (rows > 0) {
      const per = id === 'west' || id === 'east' ? BOXES.perRowSide : BOXES.perRowEnd;
      const tex = bin.own(glassTexture(per, rows, s.primary, `${s.abbr}-${id}`, aniso));
      glass = bin.own(lambert('#ffffff', { map: tex.texture, emissiveMap: tex.texture, emissive: '#ffffff' }));
    }
    B.flush(bin, bin.group, (name) => (name === 'seats' ? seats : name === 'glass' ? glass : shared[name]), shadows);
    if (glass) bin.glass.push(glass);
  }

  function buildCorners(s: StadiumSnapshot): void {
    const steps = cornerSteps(detail);
    for (const c of CORNER_KEYS) {
      const p = cornerProfile(s.corners[c], ribbonsOn(s));
      if (!p) continue;
      const path = cornerPath(c, steps);
      const B = new Builders();
      sweep(B.get, p.segs, path, p.rows.length, (seg) => route(seg, p.standing));
      caps(B.get('facade'), p.points, path);
      const r = cornerRoof(s, c);
      if (r > 0) roof(B.get, p, path, r, pathLength(path, p.depth * 0.6), detail);
      const seats = seatMaterial(corners, s, p, (Math.PI / 2) * (5 + p.depth / 2), 0, false);
      B.flush(corners, corners.group, (name) => (name === 'seats' ? seats : shared[name]), shadows);
    }
  }

  // ---- Ground: plaza, bowl, pitch, goals -----------------------------------

  function buildBase(): void {
    const g = new GeoBuilder();
    g.quad([-130, 0, 115], [130, 0, 115], [130, 0, -115], [-130, 0, -115], [0, 1, 0]);
    const geo = g.build();
    if (!geo) return;
    const m = base.mesh(geo, M.plaza);
    m.name = 'plaza';
    m.receiveShadow = shadows;
  }

  function buildPitch(): void {
    const B = new Builders();
    B.get('bowl').quad([-END_FRONT, 0.05, SIDE_FRONT], [END_FRONT, 0.05, SIDE_FRONT], [END_FRONT, 0.05, -SIDE_FRONT], [-END_FRONT, 0.05, -SIDE_FRONT], [0, 1, 0]);
    const L = GRASS.length / 2;
    const W = GRASS.width / 2;
    B.get('pitch').quad([-L, 0.1, W], [L, 0.1, W], [L, 0.1, -W], [-L, 0.1, -W], [0, 1, 0], [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    const white = B.get('white');
    for (const sx of [-1, 1]) {
      const x = sx * 52.5;
      white.beam([x, 0, -3.66], [x, 2.44, -3.66], 0.12);
      white.beam([x, 0, 3.66], [x, 2.44, 3.66], 0.12);
      white.beam([x, 2.44, -3.72], [x, 2.44, 3.72], 0.12);
      // The net frame.
      const bx = x + sx * 2;
      white.beam([x, 2.44, -3.66], [bx, 0.9, -3.66], 0.05);
      white.beam([x, 2.44, 3.66], [bx, 0.9, 3.66], 0.05);
      white.beam([bx, 0.9, -3.66], [bx, 0.9, 3.66], 0.05);
    }
    B.flush(pitchBin, pitchBin.group, (name) => shared[name], shadows);
  }

  // ---- Extras: floodlights, boards, signage, shop, concourse ---------------

  function floodlights(get: Get, level: number): void {
    const steel = get('steel');
    if (level <= 0) {
      // Small poles along the touchlines.
      for (const side of [-1, 1]) {
        for (const x of [-40, -13, 13, 40]) {
          const z = side * 38.6;
          steel.beam([x, 0, z], [x, 18, z], 0.35);
          panel(get('lamp'), get('dark'), [x, 18.5, z - side * 0.3], [0, -0.6, -side], 2.4, 1.3, 0.4);
        }
      }
      return;
    }
    const h = [0, 40, 50, 55][level] ?? 55;
    const [hw, hh] = ([[0, 0], [6, 4], [8, 5], [10, 6]] as [number, number][])[level] ?? [10, 6];
    for (const c of CORNER_KEYS) {
      const cc = cornerCentre(c);
      const sx = Math.sign(cc.x);
      const sz = Math.sign(cc.z);
      const x = cc.x + sx * 45 * DIAG;
      const z = cc.z + sz * 45 * DIAG;
      steel.beam([x, 0, z], [x, h * 0.55, z], 1.6);
      steel.beam([x, h * 0.55, z], [x, h - 1, z], 1.1);
      if (detail >= 2) {
        for (let y = 6; y < h - 4; y += 6) steel.beam([x - 0.9, y, z], [x + 0.9, y, z], 0.12);
      }
      panel(get('lamp'), get('dark'), [x - sx * 0.6, h + hh / 2 - 1, z - sz * 0.6], [-x, -h * 0.9, -z], hw, hh, 0.8);
    }
  }

  function videoBoards(get: Get, s: StadiumSnapshot, level: number): void {
    if (level <= 0) return;
    const [w, h] = ([[0, 0], [8, 4.5], [14, 7.5], [16, 9]] as [number, number][])[level] ?? [16, 9];
    const ends: StandKey[] = level >= 3 ? ['north', 'south'] : ['north'];
    for (const id of ends) {
      const p = profileOf(s, id);
      const sign = id === 'north' ? -1 : 1;
      const top = hasRoof(s, id) ? roofShape(p, s.stands[id].roof).yBack : p.height;
      const x = sign * (END_FRONT + p.depth + 0.5);
      const y0 = top + 1.5;
      panel(get('screen'), get('dark'), [x, y0 + h / 2, 0], [-sign, 0, 0], w, h, 0.8);
      for (const zz of [-w / 3, w / 3]) get('steel').beam([x + sign * 0.7, 0, zz], [x + sign * 0.7, y0 + 0.2, zz], 0.5);
    }
  }

  function pitchBoards(get: Get, signage: number): void {
    const front = get(signage >= 1 ? 'adsLed' : 'adsPaint');
    const dark = get('dark');
    const y0 = 0.1;
    const y1 = 1.0;
    for (const s of [-1, 1]) {
      const z = s * 37.5;
      dark.box(0, (y0 + y1) / 2, z + s * 0.08, 90, y1 - y0, 0.12);
      strip(front, [-45, z], [45, z], y0, y1, [0, 0, -s], 0, 90 / 48);
      const x = s * 56.5;
      dark.box(x + s * 0.08, (y0 + y1) / 2, 0, 0.12, y1 - y0, 56);
      strip(front, [x, -28], [x, 28], y0, y1, [-s, 0, 0], 0, 56 / 48);
    }
  }

  function shop(get: Get, s: StadiumSnapshot, level: number): void {
    if (level <= 0) return;
    const z = -(SIDE_FRONT + profileOf(s, 'east').depth + 12);
    const x = 30;
    if (level === 1) {
      get('kiosk').box(x, 1.5, z, 5, 3, 3.5);
      get('awning').box(x, 3.1, z - 2.2, 5.6, 0.25, 1.4);
      strip(get('sign'), [x - 2.4, z - 1.77], [x + 2.4, z - 1.77], 1.7, 2.9, [0, 0, -1], 0, 1);
    } else {
      get('shopWall').box(x, 4.5, z - 4, 24, 9, 12);
      strip(get('shopGlass'), [x - 11, z - 10.02], [x + 11, z - 10.02], 0.3, 5.4, [0, 0, -1], 0, 1);
      strip(get('sign'), [x - 5.6, z - 10.04], [x + 5.6, z - 10.04], 5.8, 8.6, [0, 0, -1], 0, 1);
    }
  }

  function concourse(get: Get, s: StadiumSnapshot, level: number): void {
    if (level < 2) return;
    for (const id of STAND_KEYS) {
      const p = profileOf(s, id);
      const path = standPath(id);
      for (const t of [0.25, 0.75]) {
        const q = pathAt(path, t, p.depth + 5);
        const yaw = Math.atan2(-q.tz, q.tx);
        get('kiosk').box(q.x, 1.3, q.z, 3.2, 2.6, 2.4, yaw);
        get('awning').box(q.x + q.nx * 1.5, 2.7, q.z + q.nz * 1.5, 3.6, 0.2, 1.0, yaw);
      }
      if (level >= 3) {
        const q = pathAt(path, 0.5, p.depth + 3.5);
        const yaw = Math.atan2(-q.tz, q.tx);
        get('canopy').box(q.x, 4.6, q.z, 16, 0.5, 6, yaw);
        for (const a of [-7, 7]) {
          for (const b of [-2.4, 2.4]) {
            const px = q.x + q.tx * a + q.nx * b;
            const pz = q.z + q.tz * a + q.nz * b;
            get('steel').beam([px, 0, pz], [px, 4.4, pz], 0.25);
          }
        }
      }
    }
  }

  function buildExtras(s: StadiumSnapshot): void {
    const B = new Builders();
    const u = s.upgrades;
    floodlights(B.get, u.floodlights);
    videoBoards(B.get, s, u.videoBoard);
    pitchBoards(B.get, u.signage);
    shop(B.get, s, u.shop);
    concourse(B.get, s, u.concourse);
    B.flush(extras, extras.group, (name) => shared[name], shadows);
  }

  // ---- Building work -------------------------------------------------------

  function addCrane(B: Builders, group: Group, x: number, z: number, height: number, jib: number, counter: number, drop: number, towards: { nx: number; nz: number }, phase: number): void {
    const mast = new Group();
    mast.position.set(x, 0, z);
    group.add(mast);
    craneMast(B.get('crane'), height, detail);
    B.flush(works, mast, (name) => shared[name], shadows);
    const head = new Group();
    head.position.set(0, height, 0);
    const baseAngle = Math.atan2(towards.nz, -towards.nx);
    head.rotation.y = baseAngle;
    mast.add(head);
    craneJib(B.get('crane'), B.get('cable'), jib, counter, jib * 0.7, drop);
    B.flush(works, head, (name) => shared[name], shadows);
    cranes.push({ jib: head, base: baseAngle, phase });
  }

  /** Where an upgrade's works go: a point and which way is "away from the pitch". */
  function upgradeSite(s: StadiumSnapshot, target: string): { x: number; z: number; nx: number; nz: number } {
    const behind = (id: StandKey, t: number, extra: number): { x: number; z: number; nx: number; nz: number } => {
      const q = pathAt(standPath(id), t, profileOf(s, id).depth + extra);
      return { x: q.x, z: q.z, nx: q.nx, nz: q.nz };
    };
    switch (target) {
      case 'floodlights': {
        const cc = cornerCentre('se');
        return { x: cc.x + 52 * DIAG, z: cc.z - 38 * DIAG, nx: DIAG, nz: -DIAG };
      }
      case 'videoBoard':
        return behind('north', 0.5, 8);
      case 'signage':
        return behind('east', 0.72, 8);
      case 'shop':
        return { x: 44, z: -(SIDE_FRONT + profileOf(s, 'east').depth + 14), nx: 0, nz: -1 };
      case 'concourse':
        return behind('west', 0.72, 8);
      default:
        return behind('west', 0.3, 8);
    }
  }

  function buildWorks(s: StadiumSnapshot): void {
    cranes = [];
    const ribbons = ribbonsOn(s);
    s.works.forEach((w, i) => {
      if (w.kind === 'upgrade' && w.target === 'pitch') return; // shown on the pitch itself
      const group = new Group();
      works.group.add(group);
      const B = new Builders();
      const phase = i * 1.7;
      if (w.kind === 'corner') {
        const c = w.target as CornerKey;
        if (!CORNER_KEYS.includes(c)) return;
        group.userData.part = 'corners';
        const target = cornerProfile(w.toLevel, ribbons);
        if (!target) return;
        const path = cornerPath(c, cornerSteps(detail));
        const now = cornerProfile(s.corners[c], ribbons);
        const back = Math.max(target.depth, now?.depth ?? 0);
        if (w.queued) {
          fence(B.get('hoarding'), path, back + 4, 2.4);
          if (now) frontBanner(B.get('hoarding'), path);
        } else {
          scaffold(B.get('scaffold'), target, path, pathLength(path, target.depth * 0.6), w.progress);
          const q = pathAt(path, 0.5, back + 8);
          B.flush(works, group, (name) => shared[name], shadows);
          addCrane(B, group, q.x, q.z, target.height + 20, 40, 12, 18, q, phase);
        }
        B.flush(works, group, (name) => shared[name], shadows);
        return;
      }
      if (w.kind === 'stand' || w.kind === 'boxes' || w.kind === 'roof') {
        const id = w.target as StandKey;
        if (!STAND_KEYS.includes(id)) return;
        group.userData.part = id;
        const st = s.stands[id];
        const path = standPath(id);
        const length = pathLength(path, 0);
        const now = profileOf(s, id);
        let target: Profile;
        if (w.kind === 'stand') target = standProfile(w.toLevel, st.boxRows, ribbons);
        else if (w.kind === 'boxes') target = standProfile(st.level, w.toLevel, ribbons);
        else target = roofProfile(now, w.toLevel);
        const back = Math.max(now.depth, target.depth);
        if (w.queued) {
          fence(B.get('hoarding'), path, back + 4, 2.4);
          frontBanner(B.get('hoarding'), path);
        } else {
          scaffold(B.get('scaffold'), target, path, length, w.progress);
          const t = i % 2 === 0 ? 0.3 : 0.7;
          const q = pathAt(path, t, back + 8);
          const top = Math.max(target.height, topOf(s, id, now));
          B.flush(works, group, (name) => shared[name], shadows);
          addCrane(B, group, q.x, q.z, top + 20, 40, 12, 18, q, phase);
        }
        B.flush(works, group, (name) => shared[name], shadows);
        return;
      }
      // Club-wide upgrades and refurbishment: a small crane (or a fenced plot).
      group.userData.part = 'ground';
      const site = upgradeSite(s, w.target);
      if (w.queued) {
        fenceSquare(B.get('hoarding'), site.x, site.z, 7);
        B.flush(works, group, (name) => shared[name], shadows);
      } else {
        addCrane(B, group, site.x, site.z, 26, 18, 6, 12, site, phase);
      }
    });
  }

  // ---- Crowd ---------------------------------------------------------------

  function buildCrowd(s: StadiumSnapshot): void {
    const cap = Math.floor(opts.crowdCap);
    const fill = Math.max(0, Math.min(1, s.attendance));
    if (cap <= 0 || fill <= 0) return;
    interface Area {
      path: PathPoint[];
      profile: Profile;
      closed: number;
      /** Front length, for the aisles (stands only). */
      aisles: number;
      key: string;
    }
    const areas: Area[] = STAND_KEYS.map((id) => {
      const path = standPath(id);
      return { path, profile: profileOf(s, id), closed: Math.max(0, Math.min(1, s.closed[id] ?? 0)), aisles: pathLength(path, 0), key: id };
    });
    const steps = cornerSteps(detail);
    for (const c of CORNER_KEYS) {
      const p = cornerProfile(s.corners[c], ribbonsOn(s));
      if (p) areas.push({ path: cornerPath(c, steps), profile: p, closed: 0, aisles: 0, key: c });
    }
    let seats = 0;
    for (const a of areas) {
      for (const r of a.profile.rows) seats += seatsAlong(pathLength(a.path, (r.d0 + r.d1) / 2)) * (1 - a.closed);
    }
    const want = crowdFigures(seats, cap, fill);
    const chance = want / Math.max(1, seats);
    const max = Math.ceil(want * 1.08) + 16;
    const bodies = new InstancedMesh(bodyGeo, crowdMat, max);
    const heads = detail >= 1 ? new InstancedMesh(headGeo, crowdMat, max) : null;
    const shirts = [s.primary, s.primary, s.secondary, '#d9d4c8', '#2a2c33'].map((c) => new Color(c));
    const skins = SKIN.map((c) => new Color(c));
    const m = new Matrix4();
    const q = new Quaternion();
    const pos = new Vector3();
    const scale = new Vector3();
    const up = new Vector3(0, 1, 0);
    const col = new Color();
    let n = 0;
    for (const a of areas) {
      const rnd = xorshift(hash(`${s.abbr}:${a.key}`));
      const standing = a.profile.standing;
      for (const r of a.profile.rows) {
        const d = (r.d0 + r.d1) / 2 + 0.05;
        const count = seatsAlong(pathLength(a.path, d));
        for (let i = 0; i < count && n < max; i++) {
          const u = (i + 0.5) / count;
          if (u < a.closed) continue;
          if (a.aisles > 0) {
            const k = (((u * a.aisles - 6) % 12) + 12) % 12;
            if (k < 0.55 || k > 11.45) continue;
          }
          if (rnd() >= chance) continue;
          const p = pathAt(a.path, u, d);
          const jitter = (rnd() - 0.5) * 0.16;
          const up2 = !standing && rnd() < 0.08 ? 0.25 : 0;
          const bodyH = standing ? 2.2 : 1;
          const sy = (0.9 + rnd() * 0.2) * bodyH;
          const y = r.y + (standing ? 0.31 * sy : 0.42) + up2;
          pos.set(p.x + p.tx * jitter, y, p.z + p.tz * jitter);
          q.setFromAxisAngle(up, Math.atan2(-p.tz, p.tx));
          scale.set(0.9 + rnd() * 0.2, sy, 1);
          m.compose(pos, q, scale);
          bodies.setMatrixAt(n, m);
          col.copy(shirts[Math.floor(rnd() * shirts.length)]).multiplyScalar(0.85 + rnd() * 0.3);
          bodies.setColorAt(n, col);
          if (heads) {
            pos.y = y + 0.31 * sy + 0.13;
            scale.set(1, 1, 1);
            m.compose(pos, q, scale);
            heads.setMatrixAt(n, m);
            heads.setColorAt(n, skins[Math.floor(rnd() * skins.length)]);
          }
          n++;
        }
      }
    }
    for (const mesh of heads ? [bodies, heads] : [bodies]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = 'crowd';
      crowd.group.add(mesh);
      crowd.own({ dispose: () => mesh.dispose() });
    }
  }

  // ---- Shared paint, lighting and highlight --------------------------------

  function repaintPitch(s: StadiumSnapshot): void {
    const work = activePitchWork(s);
    const relaying = work ? Math.round(work.progress * 18) / 18 : null;
    const key = JSON.stringify([s.look.mow, s.upgrades.pitch, Math.round(s.condition * 20), relaying, crestImg ? crestSrc : '']);
    if (key === pitchKey) return;
    pitchKey = key;
    paintPitch(pitchTex, { mow: s.look.mow, level: s.upgrades.pitch, condition: s.condition, relaying }, crestImg);
  }

  function paintShared(s: StadiumSnapshot): void {
    const ak = JSON.stringify([s.sponsors, s.primary, s.secondary, s.abbr, s.clubName]);
    if (ak !== adsKey) {
      adsKey = ak;
      paintAds(ads, s);
    }
    const bk = JSON.stringify([s.crestSvg, s.abbr, s.clubName, s.name, s.primary, s.secondary]);
    if (bk !== boardKey) {
      boardKey = bk;
      void paintBoard(board, s).then(() => {
        if (!disposed) dirty();
      });
    }
    const brand = JSON.stringify([s.primary, s.secondary, s.abbr]);
    if (brand !== brandKey) {
      brandKey = brand;
      hoarding?.dispose();
      sign?.dispose();
      hoarding = hoardingTexture(s, aniso);
      sign = signTexture(s, 'STORE', aniso);
      M.hoarding.map = hoarding.texture;
      M.sign.map = sign.texture;
      M.hoarding.needsUpdate = true;
      M.sign.needsUpdate = true;
    }
    if (s.crestSvg !== crestSrc) {
      const src = s.crestSvg;
      crestSrc = src;
      crestImg = null;
      void loadSvg(src).then((img) => {
        if (disposed || crestSrc !== src || !snap) return;
        crestImg = img;
        repaintPitch(snap);
        dirty();
      });
    }
    repaintPitch(s);
  }

  function applyLook(s: StadiumSnapshot): void {
    const fl = s.upgrades.floodlights;
    for (const b of bins) for (const m of b.glow) m.emissiveIntensity = lit * (0.2 + 0.12 * fl);
    M.pitch.emissiveIntensity = lit * (0.25 + 0.18 * fl);
    M.adsPaint.emissiveIntensity = lit * (0.3 + 0.12 * fl);
    glowUniform.value = lit * (0.22 + 0.1 * fl);
    M.wall.color.set(s.primary).multiplyScalar(0.7);
    const fresh = new Color('#d4d6da');
    M.facade.color.set('#9a968d').lerp(fresh, Math.max(0, Math.min(1, s.condition)));
    M.facade.emissive.set(s.upgrades.concourse >= 1 ? '#ffffff' : '#000000');
    M.facade.emissiveIntensity = lit * (0.6 + 0.3 * s.upgrades.concourse);
    const roofColour = { white: '#e9ecef', primary: s.primary, secondary: s.secondary, grey: '#7d838c' }[s.look.roof] ?? '#e9ecef';
    M.roof.color.set(roofColour);
    M.fascia.emissive.set(s.primary);
    M.fascia.emissiveIntensity = fl >= 3 ? 0.9 : 0;
    M.kiosk.color.set(s.secondary);
    M.awning.color.set(s.primary);
    M.canopy.color.set(s.primary);
    M.shopGlass.emissiveIntensity = 0.3 + 0.6 * lit;
    for (const b of bins) for (const m of b.glass) m.emissiveIntensity = 0.35 + 0.65 * lit;
  }

  function groupsFor(part: StadiumPart): Object3D[] {
    const out: Object3D[] = [];
    if (part === 'corners') out.push(corners.group);
    else if (part === 'ground') out.push(pitchBin.group, extras.group);
    else out.push(stands[part].group);
    for (const g of works.group.children) if (g.userData.part === part) out.push(g);
    return out;
  }

  function applyHighlight(): void {
    for (const o of overlays) o.removeFromParent();
    overlays = [];
    if (!selected) return;
    const targets: Mesh[] = [];
    for (const g of groupsFor(selected)) {
      g.traverse((o) => {
        if (o instanceof Mesh && !(o instanceof InstancedMesh) && !o.userData.overlay) targets.push(o);
      });
    }
    for (const t of targets) {
      const m = new Mesh(t.geometry, highlight);
      m.userData.overlay = true;
      m.renderOrder = 2;
      t.add(m);
      overlays.push(m);
    }
  }

  buildBase();
  buildPitch();

  return {
    root,
    update(s) {
      snap = s;
      paintShared(s);
      const ribbons = ribbonsOn(s);
      let rebuilt = false;
      const refresh = (bin: Bin, key: string, build: () => void): void => {
        if (bin.key === key) return;
        bin.clear();
        build();
        bin.key = key;
        rebuilt = true;
      };
      const paint = [s.look.seats, s.primary, s.secondary, s.abbr];
      for (const id of STAND_KEYS) {
        const key = JSON.stringify([s.stands[id], ribbons, paint, Math.round((s.closed[id] ?? 0) * 50)]);
        refresh(stands[id], key, () => buildStand(id, s));
      }
      const roofs = CORNER_KEYS.map((c) => cornerRoof(s, c));
      refresh(corners, JSON.stringify([s.corners, roofs, ribbons, paint]), () => buildCorners(s));
      refresh(extras, JSON.stringify([s.upgrades, s.stands]), () => buildExtras(s));
      const workKey = s.works.map((w) => [w.kind, w.target, w.toLevel, w.queued, Math.round(w.progress * 20)]);
      refresh(works, JSON.stringify([workKey, s.stands, s.corners, ribbons]), () => buildWorks(s));
      const closed = STAND_KEYS.map((id) => Math.round((s.closed[id] ?? 0) * 50));
      refresh(crowd, JSON.stringify([s.stands, s.corners, closed, Math.round(s.attendance * 50), s.primary, s.secondary, s.abbr, opts.crowdCap]), () => buildCrowd(s));
      applyLook(s);
      if (rebuilt) applyHighlight();
    },
    setLit(value) {
      if (value === lit) return;
      lit = value;
      if (snap) applyLook(snap);
    },
    select(part) {
      if (part === selected) return;
      selected = part;
      applyHighlight();
    },
    tick(dt) {
      time += dt;
      let moving = false;
      if (selected && overlays.length > 0) {
        highlight.opacity = 0.14 + 0.18 * (0.5 + 0.5 * Math.sin(time * 4));
        moving = true;
      }
      if (animate && snap) {
        if (snap.upgrades.signage >= 1) {
          ads.texture.offset.x = (ads.texture.offset.x + dt * 0.03) % 1;
          moving = true;
        }
        for (const c of cranes) {
          c.jib.rotation.y = c.base + 0.55 * Math.sin(time * 0.2 + c.phase);
          moving = true;
        }
      }
      return moving;
    },
    hits() {
      return [pitchBin.group, extras.group, ...STAND_KEYS.map((id) => stands[id].group), corners.group, works.group];
    },
    dispose() {
      disposed = true;
      for (const b of bins) b.clear();
      for (const m of Object.values(M)) m.dispose();
      crowdMat.dispose();
      highlight.dispose();
      bodyGeo.dispose();
      headGeo.dispose();
      for (const t of [ads, board, pitchTex, cladding, windows, hoarding, sign]) t?.dispose();
      root.removeFromParent();
    },
  };
}

/** Exposed for tests and the office: the stadium's footprint half-sizes in metres. */
export function stadiumExtent(snap: Pick<StadiumSnapshot, 'stands'>): { x: number; z: number; height: number } {
  let x = END_FRONT;
  let z = SIDE_FRONT;
  let height = 0;
  for (const id of STAND_KEYS) {
    const p = standProfile(snap.stands[id].level, snap.stands[id].boxRows);
    const top = snap.stands[id].roof > 0 && snap.stands[id].level >= 1 ? roofShape(p, snap.stands[id].roof).yFront : p.height;
    height = Math.max(height, top);
    if (id === 'north' || id === 'south') x = Math.max(x, END_FRONT + p.depth);
    else z = Math.max(z, SIDE_FRONT + p.depth);
  }
  return { x, z, height };
}


