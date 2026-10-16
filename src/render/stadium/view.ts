/**
 * The 3D stadium on the Stadium tab: the ground in daylight (or under its
 * floodlights at night) that the owner can turn, tilt, zoom and tap to pick
 * a stand. Loaded with a dynamic import, like the office, so the plain menus
 * never download three.js.
 */
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Box3,
  BoxGeometry,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import tuning from '../../data/tuning/stadium.json';
import { QUALITY_TIERS, type QualityTier } from '../quality';
import { END_FRONT, SIDE_FRONT } from './layout';
import { buildStadiumModel, partOf, stadiumExtent } from './model';
import type { StadiumPart, StadiumSnapshot } from './types';

export type { StadiumPart, StadiumSnapshot } from './types';

const VIEW = tuning.view;
export type ViewPresetId = 'aerial' | 'main' | 'end' | 'top';
export const VIEW_PRESETS = VIEW.presets as readonly { id: ViewPresetId; label: string; azimuth: number; elevation: number; zoom: number }[];
const FOCUS = VIEW.focus as Record<StadiumPart, { azimuth: number; elevation: number; zoom: number; shift: number; inside: boolean }>;

export interface StadiumViewOptions {
  tier: QualityTier;
  onPick(part: StadiumPart): void;
  /** The browser dropped the WebGL context. */
  onLost?(): void;
}

export interface StadiumViewHandle {
  update(snap: StadiumSnapshot): void;
  /** Highlights a part; `focus` also turns the camera to face it. */
  select(part: StadiumPart | null, focus?: boolean): void;
  setNight(night: boolean): void;
  preset(id: ViewPresetId): void;
  /** Zooms in (negative) or out (positive) by steps. */
  zoom(steps: number): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

interface Orbit {
  az: number;
  el: number;
  zoom: number;
}

const DEG = Math.PI / 180;
const MIN_EL = VIEW.minElevation * DEG;
const MAX_EL = VIEW.maxElevation * DEG;

function skyTexture(top: string, horizon: string): CanvasTexture {
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

/** A seeded ring of low buildings and trees, so the ground doesn't sit in a void. */
function buildSurroundings(blocks: number, shadows: boolean): { root: Group; dispose(): void } {
  const root = new Group();
  root.name = 'surroundings';
  let seed = 7;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const ground = new Mesh(new CircleGeometry(1500, 48), new MeshLambertMaterial({ color: '#61734f' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = shadows;
  root.add(ground);

  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const up = new Vector3(0, 1, 0);
  const tint = new Color();

  // Houses with pitched roofs, and the odd flat-roofed block of flats.
  const WALLS = ['#b5654a', '#c9b79c', '#e6dfd0', '#9a8f84', '#c48a62', '#d8cbb2'];
  const ROOFS = ['#5b3a2e', '#7a4632', '#4a4b52', '#6b5a4e'];
  const count = Math.max(30, blocks * 5);
  const houses = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: '#ffffff' }), count);
  const roofGeo = new ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.translate(0, 0.5, 0);
  const roofs = new InstancedMesh(roofGeo, new MeshLambertMaterial({ color: '#ffffff' }), count);
  let roofCount = 0;
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 190 + rand() * 340;
    const flats = rand() < 0.18;
    const w = flats ? 16 + rand() * 14 : 8 + rand() * 8;
    const d = flats ? 12 + rand() * 8 : 7 + rand() * 5;
    const h = flats ? 12 + rand() * 18 : 5 + rand() * 3;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    q.setFromAxisAngle(up, a + (rand() < 0.5 ? 0 : Math.PI / 2));
    houses.setMatrixAt(i, m.compose(p.set(x, h / 2, z), q, s.set(w, h, d)));
    houses.setColorAt(i, tint.set(WALLS[Math.floor(rand() * WALLS.length)]).offsetHSL(0, 0, (rand() - 0.5) * 0.08));
    if (!flats) {
      roofs.setMatrixAt(roofCount, m.compose(p.set(x, h, z), q, s.set(w * 1.06, 2.5 + rand() * 1.5, d * 1.06)));
      roofs.setColorAt(roofCount, tint.set(ROOFS[Math.floor(rand() * ROOFS.length)]));
      roofCount += 1;
    }
  }
  roofs.count = roofCount;
  houses.castShadow = false;
  houses.receiveShadow = shadows;
  root.add(houses, roofs);

  const trees = Math.max(30, blocks * 3);
  const crowns = new InstancedMesh(new ConeGeometry(1, 1, 7), new MeshLambertMaterial({ color: '#ffffff' }), trees);
  const trunks = new InstancedMesh(new CylinderGeometry(0.5, 0.5, 1, 5), new MeshLambertMaterial({ color: '#5a4330' }), trees);
  for (let i = 0; i < trees; i++) {
    const a = rand() * Math.PI * 2;
    const r = 150 + rand() * 60;
    const h = 7 + rand() * 6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    q.identity();
    crowns.setMatrixAt(i, m.compose(p.set(x, 2 + h / 2, z), q, s.set(h * 0.32, h, h * 0.32)));
    crowns.setColorAt(i, tint.setHSL(0.27 + rand() * 0.08, 0.35, 0.22 + rand() * 0.1));
    trunks.setMatrixAt(i, m.compose(p.set(x, 1.1, z), q, s.set(0.5, 2.2, 0.5)));
  }
  crowns.castShadow = shadows;
  root.add(crowns, trunks);

  return {
    root,
    dispose() {
      for (const o of [ground, houses, roofs, crowns, trunks]) {
        o.geometry.dispose();
        (o.material as MeshLambertMaterial).dispose();
      }
      root.removeFromParent();
    },
  };
}

export function createStadiumView(container: HTMLElement, opts: StadiumViewOptions): StadiumViewHandle {
  const tier = QUALITY_TIERS[opts.tier];
  const shadows = tier.shadows && tier.detail >= 1;
  const renderer = new WebGLRenderer({ antialias: tier.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'stadium-canvas';
  container.appendChild(canvas);

  let lost = false;
  const onLost = (e: Event): void => {
    e.preventDefault();
    lost = true;
    opts.onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  const scene = new Scene();
  const daySky = skyTexture('#5d8fd0', '#d5e3ef');
  const nightSky = skyTexture('#03060f', '#1a2340');
  scene.background = daySky;
  scene.fog = new Fog('#d5e3ef', 650, 1500);
  const camera = new PerspectiveCamera(VIEW.fov, 1, 1, 3000);
  const target = new Vector3().fromArray(VIEW.target);

  const sky = new HemisphereLight('#dce8ff', '#5b5340', 1.5);
  const sun = new DirectionalLight('#fff1dc', 2.4);
  sun.position.set(90, 210, -150);
  sun.castShadow = shadows;
  if (shadows) {
    const size = tier.shadowMapSize;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -165;
    cam.right = 165;
    cam.top = 165;
    cam.bottom = -165;
    cam.near = 20;
    cam.far = 600;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
  }
  scene.add(sky, sun, sun.target);

  let dirty = true;
  const model = buildStadiumModel(tier, {
    crowdCap: Math.round(VIEW.crowdCap * tier.crowdDensity),
    selfLit: VIEW.daySelfLit,
    onDirty: () => {
      dirty = true;
    },
    anisotropy: Math.min(renderer.capabilities.getMaxAnisotropy(), tier.detail >= 2 ? 8 : 4),
    shadows,
    animate: true,
  });
  const surroundings = buildSurroundings(tier.cityBlocks, shadows);
  scene.add(model.root, surroundings.root);

  // The camera orbits the centre spot; `goal` is where it is heading.
  const first = VIEW_PRESETS[0];
  const cur: Orbit = { az: first.azimuth * DEG, el: first.elevation * DEG, zoom: first.zoom };
  const goal: Orbit = { ...cur };
  // The point the camera turns around: the centre spot, or nearer a focused part.
  const centre = target.clone();
  const targetGoal = target.clone();
  let fit = 240;
  let night = false;
  let floodlights = 0;

  const clampOrbit = (o: Orbit): void => {
    o.el = MathUtils.clamp(o.el, MIN_EL, MAX_EL);
    o.zoom = MathUtils.clamp(o.zoom, VIEW.minZoom, VIEW.maxZoom);
  };
  const aimAt = (az: number, el: number, zoom: number): void => {
    // Take the short way round.
    let a = az * DEG;
    while (a - cur.az > Math.PI) a -= Math.PI * 2;
    while (a - cur.az < -Math.PI) a += Math.PI * 2;
    goal.az = a;
    goal.el = el * DEG;
    goal.zoom = zoom;
    clampOrbit(goal);
    dirty = true;
  };

  /** Distance that fits the whole ground in the narrower field of view. */
  const refit = (snap: StadiumSnapshot): void => {
    const ext = stadiumExtent(snap);
    const radius = Math.hypot(ext.x + 12, ext.z + 12) * VIEW.fitScale;
    const vfov = camera.fov * DEG;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    fit = radius / Math.sin(Math.min(vfov, hfov) / 2);
  };
  let lastSnap: StadiumSnapshot | null = null;

  /** The middle of a part's meshes (null if it has none). */
  const box = new Box3();
  const partCentre = (part: StadiumPart): Vector3 | null => {
    box.makeEmpty();
    model.root.updateMatrixWorld(true);
    for (const group of model.hits()) {
      group.traverse((o) => {
        if ((o as Mesh).isMesh && o.visible && partOf(o) === part) box.expandByObject(o);
      });
    }
    if (box.isEmpty()) return null;
    const c = box.getCenter(new Vector3());
    c.y = Math.min(c.y, 12);
    return c;
  };

  /**
   * How far the camera can back away from `p` (along the ground, towards
   * azimuth `az`) before it leaves the space inside the stands' front edges.
   */
  const insideReach = (p: Vector3, az: number): number => {
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    let reach = Infinity;
    if (Math.abs(dx) > 1e-6) reach = Math.min(reach, (Math.sign(dx) * END_FRONT - p.x) / dx);
    if (Math.abs(dz) > 1e-6) reach = Math.min(reach, (Math.sign(dz) * SIDE_FRONT - p.z) / dz);
    return Math.max(10, reach - 4);
  };

  const placeCamera = (): void => {
    const d = fit * cur.zoom;
    camera.position.set(
      target.x + Math.sin(cur.az) * Math.cos(cur.el) * d,
      target.y + Math.sin(cur.el) * d,
      target.z + Math.cos(cur.az) * Math.cos(cur.el) * d,
    );
    camera.lookAt(target);
  };

  const applyTime = (): void => {
    model.setLit(night ? VIEW.nightSelfLit : VIEW.daySelfLit);
    scene.background = night ? nightSky : daySky;
    (scene.fog as Fog).color.set(night ? '#1a2340' : '#d5e3ef');
    if (night) {
      // Floodlights light the bowl; without them the ground is nearly dark.
      sky.color.set('#c9d6ff');
      sky.groundColor.set('#2a2a30');
      sky.intensity = 0.12 + 0.3 * floodlights;
      sun.color.set('#9fb3ff');
      sun.intensity = 0.25;
    } else {
      sky.color.set('#dce8ff');
      sky.groundColor.set('#5b5340');
      sky.intensity = 1.5;
      sun.color.set('#fff1dc');
      sun.intensity = 2.4;
    }
    dirty = true;
  };

  // Touch: a sideways drag turns the ground (an up-down drag scrolls the
  // page), two fingers pinch to zoom and slide up or down to tilt. A mouse
  // drags both ways and the wheel zooms. A short tap picks a part.
  const pointers = new Map<number, { x: number; y: number }>();
  let down = { x: 0, y: 0, t: 0 };
  let moved = false;
  let pinch = 0;
  let pinchY = 0;
  const raycaster = new Raycaster();
  const ndc = new Vector2();

  const tap = (x: number, y: number): void => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    for (const hit of raycaster.intersectObjects(model.hits(), true)) {
      const part = partOf(hit.object);
      if (part) return opts.onPick(part);
    }
  };
  const twoFingers = (): { d: number; y: number } => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), y: (a.y + b.y) / 2 };
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      moved = false;
    } else if (pointers.size === 2) {
      const f = twoFingers();
      pinch = f.d;
      pinchY = f.y;
      moved = true;
    }
  };
  const onMove = (e: PointerEvent): void => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) return;
      moved = true;
      goal.az -= dx * 0.008;
      if (e.pointerType === 'mouse') goal.el += dy * 0.006;
    } else if (pointers.size === 2) {
      const f = twoFingers();
      if (pinch > 0 && f.d > 0) goal.zoom *= pinch / f.d;
      goal.el += (f.y - pinchY) * 0.006;
      pinch = f.d;
      pinchY = f.y;
    }
    clampOrbit(goal);
    // Direct control: no easing lag under the finger.
    cur.az = goal.az;
    cur.el = goal.el;
    cur.zoom = goal.zoom;
    dirty = true;
  };
  const onUp = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    if (e.type === 'pointerup' && pointers.size === 1 && !moved && performance.now() - down.t < 600) tap(e.clientX, e.clientY);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    // Lifting one of two fingers shouldn't turn into a jump or a tap.
    if (pointers.size === 1) moved = true;
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    goal.zoom *= Math.exp(e.deltaY * 0.0012);
    clampOrbit(goal);
    dirty = true;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (lastSnap) refit(lastSnap);
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let lastTime = performance.now();
  let sinceDraw = 0;
  let frame = 0;
  let running = true;
  const loop = (): void => {
    frame = requestAnimationFrame(loop);
    const t = performance.now();
    const dt = Math.min(0.05, (t - lastTime) / 1000);
    lastTime = t;
    sinceDraw += dt;
    if (lost) return;
    // Ease towards the goal (presets and focus turns).
    const k = 1 - Math.exp(-dt * 6);
    let easing = false;
    if (target.distanceToSquared(targetGoal) > 1e-4) {
      target.lerp(targetGoal, k);
      easing = true;
    } else {
      target.copy(targetGoal);
    }
    for (const key of ['az', 'el', 'zoom'] as const) {
      const gap = goal[key] - cur[key];
      if (Math.abs(gap) > 1e-4) {
        cur[key] += gap * k;
        easing = true;
      } else {
        cur[key] = goal[key];
      }
    }
    const animating = model.tick(dt);
    // Cameras move at full rate; boards and cranes are fine at 30 fps.
    if (!dirty && !easing && !(animating && sinceDraw >= 1 / 30)) return;
    dirty = false;
    sinceDraw = 0;
    placeCamera();
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  return {
    update(snap) {
      lastSnap = snap;
      model.update(snap);
      refit(snap);
      if (snap.upgrades.floodlights !== floodlights) {
        floodlights = snap.upgrades.floodlights;
        applyTime();
      }
      dirty = true;
    },
    select(part, focus = false) {
      model.select(part);
      if (focus && part) {
        const f = FOCUS[part];
        targetGoal.lerpVectors(centre, partCentre(part) ?? centre, f.shift);
        let zoom = f.zoom;
        if (f.inside) zoom = Math.min(zoom, insideReach(targetGoal, f.azimuth * DEG) / Math.cos(f.elevation * DEG) / fit);
        aimAt(f.azimuth, f.elevation, zoom);
      }
      dirty = true;
    },
    setNight(value) {
      if (value === night) return;
      night = value;
      applyTime();
    },
    preset(id) {
      const p = VIEW_PRESETS.find((x) => x.id === id) ?? first;
      targetGoal.copy(centre);
      aimAt(p.azimuth, p.elevation, p.zoom);
    },
    zoom(steps) {
      goal.zoom *= Math.pow(1.25, steps);
      clampOrbit(goal);
      dirty = true;
    },
    pause() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    },
    resume() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      dirty = true;
      frame = requestAnimationFrame(loop);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      model.dispose();
      surroundings.dispose();
      daySky.dispose();
      nightSky.dispose();
      sun.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
