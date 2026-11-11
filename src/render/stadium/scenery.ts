/**
 * What sits around the ground: a sky gradient and the town (streets, houses, shops, flats,
 * a church, a works, parks and match-day car parks), with fields, the city centre's towers,
 * hills and clouds beyond. Shared by the Stadium tab, the title
 * screen and the match-day view.
 *
 * The town's pieces are modelled in Blender (scripts/assets/scenery-kit.py) and arrive in
 * one small file, scenery.glb. town.ts decides where each one stands; here they are all
 * baked into a few meshes, so the whole town costs four draw calls: the flat ground, the
 * buildings, trees and hills, the windows (which light up at night) and the clouds.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  Matrix3,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import tuning from '../../data/tuning/scenery.json';
import type { Assets } from '../assets';
import { layoutTown, type Patch, type Placement } from './town';

const C = tuning.colours;
/** Zones in a piece's vertex colours (alpha times 255): see scenery-kit.py. */
const TINT_A = 1;
const TINT_B = 2;
const WINDOW = 3;

export function skyTexture(top: string, horizon: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.62, horizon);
  grad.addColorStop(1, horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface Surroundings {
  root: Group;
  /** Lights the town's windows (night) or puts them out (day). */
  setNight(night: boolean): void;
  dispose(): void;
}

/** One piece from scenery.glb, unpacked: its solid triangles and its window triangles. */
interface Piece {
  pos: Float32Array;
  nor: Float32Array;
  /** Linear colour per vertex. */
  col: Float32Array;
  zone: Uint8Array;
  /** Which window of the piece a window vertex belongs to. */
  window: Uint8Array;
  solid: number[];
  glass: number[];
  solidVerts: number;
  glassVerts: number;
  /** Each vertex's place among the solid or the glass vertices. */
  slot: Uint32Array;
}

function unpack(mesh: Mesh): Piece {
  const g = mesh.geometry;
  const P = g.getAttribute('position');
  const N = g.getAttribute('normal');
  const K = g.getAttribute('color');
  const n = P.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const zone = new Uint8Array(n);
  const window = new Uint8Array(n);
  const slot = new Uint32Array(n);
  const v = new Vector3();
  const c = new Color();
  // The file packs positions small; the mesh's own transform puts them back in metres.
  const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
  let solidVerts = 0;
  let glassVerts = 0;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld);
    pos.set([v.x, v.y, v.z], i * 3);
    v.fromBufferAttribute(N, i).applyMatrix3(normalMatrix).normalize();
    nor.set([v.x, v.y, v.z], i * 3);
    c.setRGB(K.getX(i), K.getY(i), K.getZ(i), SRGBColorSpace);
    col.set([c.r, c.g, c.b], i * 3);
    const a = Math.round(K.getW(i) * 255);
    zone[i] = Math.min(a, WINDOW);
    window[i] = Math.max(0, a - WINDOW);
    slot[i] = zone[i] === WINDOW ? glassVerts++ : solidVerts++;
  }
  const solid: number[] = [];
  const glass: number[] = [];
  const index = g.index;
  const count = index ? index.count : n;
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i;
    const b = index ? index.getX(i + 1) : i + 1;
    const d = index ? index.getX(i + 2) : i + 2;
    (zone[a] === WINDOW ? glass : solid).push(a, b, d);
  }
  return { pos, nor, col, zone, window, solid, glass, solidVerts, glassVerts, slot };
}

/** The flat ground: roads, pavements, lawns and yards as coloured rectangles. */
function patchGeometry(patches: readonly Patch[]): BufferGeometry {
  const pos = new Float32Array(patches.length * 12);
  const nor = new Float32Array(patches.length * 12);
  const col = new Float32Array(patches.length * 12);
  const index = new Uint32Array(patches.length * 6);
  const c = new Color();
  patches.forEach((p, i) => {
    pos.set([p.x0, p.y, p.z1, p.x1, p.y, p.z1, p.x1, p.y, p.z0, p.x0, p.y, p.z0], i * 12);
    c.set(p.colour);
    for (let k = 0; k < 4; k++) {
      nor.set([0, 1, 0], i * 12 + k * 3);
      col.set([c.r, c.g, c.b], i * 12 + k * 3);
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(index, 1));
  return g;
}

/** A small repeatable hash to 0..1, for which windows are lit. */
function chance(a: number, b: number): number {
  let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Every placed piece baked into one solid mesh and one mesh of windows. */
function bake(pieces: Map<string, Piece>, placements: readonly Placement[]): { solid: BufferGeometry; glass: BufferGeometry; day: Float32Array; night: Float32Array } {
  let sv = 0;
  let si = 0;
  let gv = 0;
  let gi = 0;
  for (const p of placements) {
    const piece = pieces.get(p.piece);
    if (!piece) continue;
    sv += piece.solidVerts;
    si += piece.solid.length;
    gv += piece.glassVerts;
    gi += piece.glass.length;
  }
  const sPos = new Float32Array(sv * 3);
  const sNor = new Float32Array(sv * 3);
  const sCol = new Float32Array(sv * 3);
  const sIdx = new Uint32Array(si);
  const gPos = new Float32Array(gv * 3);
  const day = new Float32Array(gv * 3);
  const night = new Float32Array(gv * 3);
  const gIdx = new Uint32Array(gi);
  const a = new Color();
  const b = new Color();
  const glassDay = new Color(C.glass);
  const glassNight = new Color(C.glassNight);
  const lit = C.lit.map((h) => new Color(h));
  let so = 0;
  let sio = 0;
  let go = 0;
  let gio = 0;
  placements.forEach((p, n) => {
    const piece = pieces.get(p.piece);
    if (!piece) return;
    const cos = Math.cos(p.rot) * p.scale;
    const sin = Math.sin(p.rot) * p.scale;
    const nc = Math.cos(p.rot);
    const ns = Math.sin(p.rot);
    a.set(p.a);
    b.set(p.b);
    const lamp = p.piece === 'lamp';
    const dark = p.piece === 'car' || p.piece === 'van';
    const count = piece.zone.length;
    for (let i = 0; i < count; i++) {
      const x = piece.pos[i * 3];
      const y = piece.pos[i * 3 + 1];
      const z = piece.pos[i * 3 + 2];
      const wx = p.x + x * cos + z * sin;
      const wy = p.y + y * p.scale;
      const wz = p.z - x * sin + z * cos;
      const zone = piece.zone[i];
      if (zone === WINDOW) {
        const o = (go + piece.slot[i]) * 3;
        gPos.set([wx, wy, wz], o);
        day.set([glassDay.r, glassDay.g, glassDay.b], o);
        const on = lamp ? a : !dark && chance(n, piece.window[i]) < C.litShare ? lit[Math.floor(chance(piece.window[i], n) * lit.length)] : glassNight;
        night.set([on.r, on.g, on.b], o);
        continue;
      }
      const o = (so + piece.slot[i]) * 3;
      sPos.set([wx, wy, wz], o);
      const nx = piece.nor[i * 3];
      const nz = piece.nor[i * 3 + 2];
      sNor.set([nx * nc + nz * ns, piece.nor[i * 3 + 1], -nx * ns + nz * nc], o);
      const t = zone === TINT_A ? a : zone === TINT_B ? b : null;
      sCol.set([piece.col[i * 3] * (t ? t.r : 1), piece.col[i * 3 + 1] * (t ? t.g : 1), piece.col[i * 3 + 2] * (t ? t.b : 1)], o);
    }
    for (const i of piece.solid) sIdx[sio++] = so + piece.slot[i];
    for (const i of piece.glass) gIdx[gio++] = go + piece.slot[i];
    so += piece.solidVerts;
    go += piece.glassVerts;
  });
  const solid = new BufferGeometry();
  solid.setAttribute('position', new BufferAttribute(sPos, 3));
  solid.setAttribute('normal', new BufferAttribute(sNor, 3));
  solid.setAttribute('color', new BufferAttribute(sCol, 3));
  solid.setIndex(new BufferAttribute(sIdx, 1));
  const glass = new BufferGeometry();
  glass.setAttribute('position', new BufferAttribute(gPos, 3));
  glass.setAttribute('color', new BufferAttribute(day.slice(), 3));
  glass.setIndex(new BufferAttribute(gIdx, 1));
  return { solid, glass, day, night };
}

/**
 * The ground the stadium stands on and the town round it. The flat ground shows at once;
 * the buildings and trees appear when scenery.glb has loaded (`onChange` asks for a redraw).
 * `detail` is the graphics tier's detail, 0 to 2: lower tiers build less of the town.
 */
export function buildSurroundings(detail: number, assets: Assets, onChange: () => void): Surroundings {
  const root = new Group();
  root.name = 'surroundings';
  const town = layoutTown(detail);
  const owned: { geometry: BufferGeometry; material: { dispose(): void } }[] = [];
  const add = <M extends Mesh>(mesh: M): M => {
    // One mesh spans the whole town, so it is always in view.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    owned.push({ geometry: mesh.geometry, material: mesh.material as MeshLambertMaterial });
    root.add(mesh);
    return mesh;
  };

  const ground = add(new Mesh(new CircleGeometry(1500, 48), new MeshLambertMaterial({ color: C.ground })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.updateMatrix();
  // The streets lie just over the grass: pull them forward so they never flicker through it.
  add(new Mesh(patchGeometry(town.patches), new MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })));

  let disposed = false;
  let night = false;
  let glass: { mesh: Mesh; day: Float32Array; night: Float32Array } | null = null;
  let clouds: MeshLambertMaterial | null = null;
  const applyNight = (): void => {
    if (clouds) clouds.emissiveIntensity = tuning.clouds.glow[night ? 1 : 0];
    if (!glass) return;
    const attr = glass.mesh.geometry.getAttribute('color') as BufferAttribute;
    (attr.array as Float32Array).set(night ? glass.night : glass.day);
    attr.needsUpdate = true;
  };

  assets
    .model('assets/stadium/scenery.glb')
    .then((gltf) => {
      if (disposed) return;
      gltf.scene.updateMatrixWorld(true);
      const pieces = new Map<string, Piece>();
      gltf.scene.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) pieces.set(m.name || m.parent?.name || '', unpack(m));
      });
      const baked = bake(pieces, town.placements.filter((p) => !p.sky));
      add(new Mesh(baked.solid, new MeshLambertMaterial({ vertexColors: true })));
      // Clouds stand clear of the ground's haze, lit by the same sky as everything else.
      const sky = bake(pieces, town.placements.filter((p) => p.sky));
      clouds = new MeshLambertMaterial({ vertexColors: true, fog: false, emissive: '#ffffff' });
      add(new Mesh(sky.solid, clouds));
      sky.glass.dispose();
      glass = { mesh: add(new Mesh(baked.glass, new MeshBasicMaterial({ vertexColors: true }))), day: baked.day, night: baked.night };
      applyNight();
      onChange();
    })
    // Without the file the ground still stands on its streets.
    .catch(() => {});

  return {
    root,
    setNight(on: boolean) {
      if (on === night) return;
      night = on;
      applyNight();
    },
    dispose() {
      disposed = true;
      for (const o of owned) {
        o.geometry.dispose();
        o.material.dispose();
      }
      root.removeFromParent();
    },
  };
}
