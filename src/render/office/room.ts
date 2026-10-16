/**
 * The room shell: floor, walls, ceiling, the big window (looking out at the
 * stadium), the door visitors come through and the corridor behind it.
 *
 * Layout (metres): x -4..4, z -5..2, height 3. The owner's chair is near
 * z = 1, looking towards the door wall at z = -5. The window wall is x = -4.
 */
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { Assets } from '../assets';
import type { TierSettings } from '../quality';

export const ROOM = {
  minX: -4,
  maxX: 4,
  minZ: -5,
  maxZ: 2,
  height: 3,
  /** Window on the x = -4 wall, in world z and y. */
  window: { z0: -3.5, z1: 0.5, y0: 0.25, y1: 2.75 },
  /** Door on the z = -5 wall, in world x and y. */
  door: { x0: 1.925, x1: 2.875, height: 2.1 },
} as const;

interface Hole {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A flat rectangle in wall space with UVs in world units, so tiles line up across panels. */
function panel(x0: number, x1: number, y0: number, y1: number, tile: number): BufferGeometry {
  const g = new PlaneGeometry(x1 - x0, y1 - y0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
  uv.needsUpdate = true;
  return g;
}

/** A wall from a to b along its local x, height h, with an optional rectangular hole. */
function wall(a: number, b: number, h: number, mat: Material, tile: number, hole?: Hole): Group {
  const g = new Group();
  const rects: [number, number, number, number][] = hole
    ? [
        [a, hole.x0, 0, h],
        [hole.x1, b, 0, h],
        [hole.x0, hole.x1, hole.y1, h],
        ...(hole.y0 > 0 ? ([[hole.x0, hole.x1, 0, hole.y0]] as [number, number, number, number][]) : []),
      ]
    : [[a, b, 0, h]];
  for (const [x0, x1, y0, y1] of rects) {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) continue;
    const m = new Mesh(panel(x0, x1, y0, y1, tile), mat);
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function box(w: number, h: number, d: number, mat: Material, x: number, y: number, z: number): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export interface PbrSet {
  map: Texture;
  normalMap: Texture;
  arm: Texture;
}

async function loadPbr(assets: Assets, name: string, anisotropy: number): Promise<PbrSet> {
  const [map, normalMap, arm] = await Promise.all(
    ['diff', 'nor', 'arm'].map((k) => assets.texture(`assets/office/${name}_${k}.ktx2`)),
  );
  for (const t of [map, normalMap, arm]) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.anisotropy = anisotropy;
  }
  map.colorSpace = SRGBColorSpace;
  normalMap.colorSpace = NoColorSpace;
  arm.colorSpace = NoColorSpace;
  return { map, normalMap, arm };
}

function pbrMaterial(set: PbrSet, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    aoMap: set.arm,
    roughnessMap: set.arm,
    metalnessMap: set.arm,
    roughness: 1,
    metalness: 1,
  });
  Object.assign(m, extra);
  return m;
}

export interface Room {
  root: Group;
  /** Invisible box over the window opening, for taps. */
  windowHit: Mesh;
  /** Door leaf pivot: rotation.y 0 is shut. */
  doorPivot: Group;
  doorHit: Object3D;
  setLevel(level: number): Promise<void>;
}

export async function buildRoom(assets: Assets, tier: TierSettings, anisotropy: number): Promise<Room> {
  const [wallSet, plankSet] = await Promise.all([
    loadPbr(assets, 'beige_wall_001', anisotropy),
    loadPbr(assets, 'brown_planks_05', anisotropy),
  ]);
  const root = new Group();
  root.name = 'room';
  const { minX, maxX, minZ, maxZ, height: H } = ROOM;

  const wallMat = pbrMaterial(wallSet, { metalness: 0, metalnessMap: null });
  wallMat.color.set('#f1ebe2');
  const floorMat = pbrMaterial(plankSet, { metalness: 0, metalnessMap: null });

  // Floor: one panel in world x/z.
  const floor = new Mesh(panel(minX, maxX, -maxZ, -minZ, 2.2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const ceilingMat = new MeshStandardMaterial({ color: '#e7e3dc', roughness: 0.95, metalness: 0 });
  const ceiling = new Mesh(new PlaneGeometry(maxX - minX, maxZ - minZ), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H, (minZ + maxZ) / 2);
  root.add(ceiling);

  // Far wall (z = -5) with the doorway. Local x = world x.
  const d = ROOM.door;
  const far = wall(minX, maxX, H, wallMat, 2.4, { x0: d.x0, x1: d.x1, y0: 0, y1: d.height });
  far.position.z = minZ;
  root.add(far);

  // Behind the camera (z = 2). Local x = -world x.
  const back = wall(-maxX, -minX, H, wallMat, 2.4);
  back.rotation.y = Math.PI;
  back.position.z = maxZ;
  root.add(back);

  // Right wall (x = 4). Local x = world z.
  const right = wall(minZ, maxZ, H, wallMat, 2.4);
  right.rotation.y = -Math.PI / 2;
  right.position.x = maxX;
  root.add(right);

  // Window wall (x = -4). Local x = -world z.
  const w = ROOM.window;
  const left = wall(-maxZ, -minZ, H, wallMat, 2.4, { x0: -w.z1, x1: -w.z0, y0: w.y0, y1: w.y1 });
  left.rotation.y = Math.PI / 2;
  left.position.x = minX;
  root.add(left);

  // Window frame, mullions and glass.
  const frameMat = new MeshStandardMaterial({ color: '#2b2e33', roughness: 0.45, metalness: 0.6 });
  const wz = (w.z0 + w.z1) / 2;
  const wLen = w.z1 - w.z0;
  const wy = (w.y0 + w.y1) / 2;
  const wH = w.y1 - w.y0;
  const t = 0.06;
  root.add(box(0.16, t, wLen + t, frameMat, minX + 0.04, w.y0, wz));
  root.add(box(0.16, t, wLen + t, frameMat, minX + 0.04, w.y1, wz));
  for (const z of [w.z0, w.z1]) root.add(box(0.16, wH, t, frameMat, minX + 0.04, wy, z));
  for (let i = 1; i < 3; i++) root.add(box(0.08, wH, 0.04, frameMat, minX + 0.02, wy, w.z0 + (wLen * i) / 3));
  root.add(box(0.08, 0.04, wLen, frameMat, minX + 0.02, w.y0 + 0.45, wz));
  if (tier.detail >= 1) {
    const glass = new Mesh(
      new PlaneGeometry(wLen, wH),
      new MeshStandardMaterial({
        color: '#a9bfd6',
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
    );
    glass.rotation.y = Math.PI / 2;
    glass.position.set(minX + 0.01, wy, wz);
    glass.renderOrder = 2;
    root.add(glass);
  }
  const windowHit = new Mesh(new PlaneGeometry(wLen, wH));
  windowHit.visible = false;
  windowHit.rotation.y = Math.PI / 2;
  windowHit.position.set(minX + 0.05, wy, wz);
  root.add(windowHit);

  // Door frame, leaf and handle. The leaf swings into the room.
  const trimMat = new MeshStandardMaterial({ color: '#efece6', roughness: 0.6, metalness: 0 });
  const dx = (d.x0 + d.x1) / 2;
  const dw = d.x1 - d.x0;
  root.add(box(0.07, d.height + 0.07, 0.14, trimMat, d.x0 - 0.035, (d.height + 0.07) / 2, minZ));
  root.add(box(0.07, d.height + 0.07, 0.14, trimMat, d.x1 + 0.035, (d.height + 0.07) / 2, minZ));
  root.add(box(dw + 0.14, 0.07, 0.14, trimMat, dx, d.height + 0.035, minZ));
  const doorMat = new MeshStandardMaterial({ color: '#6b4a32', roughness: 0.55, metalness: 0 });
  const doorPivot = new Group();
  doorPivot.position.set(d.x0, 0, minZ);
  const leaf = box(dw - 0.01, d.height - 0.01, 0.045, doorMat, dw / 2, d.height / 2, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  doorPivot.add(leaf);
  const handleMat = new MeshStandardMaterial({ color: '#c9c3b8', roughness: 0.3, metalness: 1 });
  for (const side of [-1, 1]) doorPivot.add(box(0.13, 0.025, 0.025, handleMat, dw - 0.14, 1.02, side * 0.045));
  root.add(doorPivot);

  // A dim corridor behind the door, so the doorway does not open onto the sky.
  const corridor = new Mesh(
    new BoxGeometry(2.2, 2.6, 2.4),
    new MeshStandardMaterial({ color: '#4a4740', roughness: 0.9, metalness: 0, side: BackSide }),
  );
  corridor.position.set(dx, 1.3, minZ - 1.2 - 0.001);
  root.add(corridor);

  // Skirting boards and ceiling downlights are small touches the Low tier skips.
  if (tier.detail >= 1) {
    const sk = 0.09;
    root.add(box(d.x0 - minX, sk, 0.02, trimMat, (minX + d.x0) / 2, sk / 2, minZ + 0.01));
    root.add(box(maxX - d.x1, sk, 0.02, trimMat, (d.x1 + maxX) / 2, sk / 2, minZ + 0.01));
    root.add(box(0.02, sk, maxZ - minZ, trimMat, maxX - 0.01, sk / 2, (minZ + maxZ) / 2));
    root.add(box(maxX - minX, sk, 0.02, trimMat, 0, sk / 2, maxZ - 0.01));
    root.add(box(0.02, sk, w.z0 - minZ, trimMat, minX + 0.01, sk / 2, (minZ + w.z0) / 2));
    root.add(box(0.02, sk, maxZ - w.z1, trimMat, minX + 0.01, sk / 2, (w.z1 + maxZ) / 2));
    const lightMat = new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff1d6', emissiveIntensity: 2.2 });
    const disc = new CircleGeometry(0.07, tier.detail >= 2 ? 24 : 12);
    for (const [x, z] of [
      [-2.4, -3.6],
      [2.4, -3.6],
      [-2.4, -0.8],
      [2.4, -0.8],
      [0, -3.6],
    ]) {
      const m = new Mesh(disc, lightMat);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, H - 0.002, z);
      root.add(m);
    }
  }

  let parquet: Promise<PbrSet> | null = null;
  let level = 0;
  return {
    root,
    windowHit,
    doorPivot,
    doorHit: leaf,
    async setLevel(next: number) {
      if (next === level) return;
      level = next;
      if (next >= 2) {
        parquet ??= loadPbr(assets, 'herringbone_parquet', anisotropy);
        const set = await parquet;
        if (level < 2) return;
        floor.material = pbrMaterial(set, { metalness: 0, metalnessMap: null });
        floor.geometry.dispose();
        floor.geometry = panel(minX, maxX, -maxZ, -minZ, 1.6);
      } else if (floor.material !== floorMat) {
        floor.material = floorMat;
      }
    },
  };
}
