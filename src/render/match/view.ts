/**
 * The 3D match (Stage 5, docs/STAGE_5_MATCH_DAY.md): the home club's ground with 22
 * players and the ball on the engine's positions, seen from a broadcast camera in the
 * main stand. Loaded with a dynamic import, like the office and the stadium, so the
 * menus and the 2D pitch never download three.js.
 *
 * The view only draws what it is handed (frame); the UI blends two engine steps into
 * each frame the same way the 2D pitch does.
 */
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import tuning from '../../data/tuning/match3d.json';
import stadiumTuning from '../../data/tuning/stadium.json';
import { Assets } from '../assets';
import { QUALITY_TIERS, type QualityTier } from '../quality';
import { buildStadiumModel } from '../stadium/model';
import { buildSurroundings, skyTexture } from '../stadium/scenery';
import { MatchCamera, type CameraKey } from './cameras';
import { Squads, loadPlayerTemplates } from './players';
import type { MatchFrame3D, MatchScene3D } from './types';

export type { MatchFrame3D, MatchScene3D, KitColours } from './types';
export { CAMERA_PRESETS, type CameraKey } from './cameras';

const HALF_X = 52.5;
const HALF_Z = 34;
/** A jump in match time bigger than this (a seek) puts everyone straight in place. */
const SNAP_MS = 2000;
/** Most match time the players' legs move in one screen frame. */
const MAX_ANIM_S = 0.25;

export interface MatchViewOptions {
  tier: QualityTier;
  scene: MatchScene3D;
  /** The players have loaded and the match is on screen. */
  onReady?(): void;
  /** The players could not load. */
  onError?(err: unknown): void;
  /** The browser dropped the WebGL context. */
  onLost?(): void;
}

export interface MatchViewStats {
  calls: number;
  triangles: number;
  /** Frames drawn per second, over the last second. */
  fps: number;
}

export interface MatchViewHandle {
  /** The match as it should look now. `cut` puts everyone straight in place (a replay starting). */
  frame(f: MatchFrame3D, cut?: boolean): void;
  /** Cuts to camera `key`; `end` (-1 or 1) holds the behind-the-goal camera at that end. */
  setCamera(key: CameraKey, end?: number): void;
  setNight(night: boolean): void;
  pause(): void;
  resume(): void;
  stats(): MatchViewStats;
  dispose(): void;
}

/** A white ball with dark panels, as an equirectangular canvas. */
function ballTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#1d1f26';
  const spots: [number, number][] = [
    [0, 4], [32, 18], [64, 4], [96, 18], [16, 38], [48, 50], [80, 38], [112, 50], [128, 4], [0, 60], [64, 60],
  ];
  for (const [x, y] of spots) {
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * 6.5, y + Math.sin(a) * 5);
    }
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A soft round shadow. */
function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export function createMatchView(container: HTMLElement, opts: MatchViewOptions): MatchViewHandle {
  const tier = QUALITY_TIERS[opts.tier];
  const shadows = tier.shadows && tier.detail >= 1;
  const renderer = new WebGLRenderer({ antialias: tier.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = PCFShadowMap;
  // The stadium's shadows never move during a match: draw them once.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const canvas = renderer.domElement;
  canvas.className = 'match3d-canvas';
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
  const camera = new PerspectiveCamera(30, 1, 1, 3000);
  const cam = new MatchCamera(camera, opts.scene.ground);

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
    crowdCap: Math.round(tuning.crowdCap * tier.crowdDensity),
    selfLit: stadiumTuning.view.daySelfLit,
    onDirty: () => {
      dirty = true;
    },
    anisotropy: Math.min(renderer.capabilities.getMaxAnisotropy(), tier.detail >= 2 ? 8 : 4),
    shadows,
    animate: true,
  });
  model.update(opts.scene.ground);
  const surroundings = buildSurroundings(tier.cityBlocks, shadows);
  scene.add(model.root, surroundings.root);

  // The ball and the soft shadows under everyone.
  const R = tuning.ball.radius;
  const ballMap = ballTexture();
  const ball = new Mesh(new SphereGeometry(R, 16, 12), new MeshLambertMaterial({ map: ballMap }));
  ball.position.set(0, R, 0);
  scene.add(ball);
  const blobMap = blobTexture();
  const blobGeo = new PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  const blobs = new InstancedMesh(
    blobGeo,
    new MeshBasicMaterial({ map: blobMap, transparent: true, opacity: tuning.shadow.opacity, depthWrite: false, color: '#000000' }),
    23,
  );
  blobs.frustumCulled = false;
  blobs.renderOrder = 1;
  scene.add(blobs);
  const blobM = new Matrix4();
  const blobQ = new Quaternion();
  const blobP = new Vector3();
  const blobS = new Vector3();

  // Players load after the ground, so the stands show while the bodies download.
  const assets = new Assets(renderer);
  let squads: Squads | null = null;
  let disposed = false;
  loadPlayerTemplates(assets)
    .then((t) => {
      if (disposed) return;
      squads = new Squads(t, opts.scene);
      scene.add(squads.root);
      snapNext = true;
      fresh = latest !== null;
      dirty = true;
      opts.onReady?.();
    })
    .catch((err: unknown) => {
      if (!disposed) opts.onError?.(err);
    });

  let latest: MatchFrame3D | null = null;
  let fresh = false;
  let lastMs = -1;
  let animDt = 0;
  let snapNext = true;
  const lastBall = new Vector3(0, R, 0);
  const held = { x: 0, y: 0, z: 0 };
  const spinAxis = new Vector3();
  const spin = new Quaternion();
  // A ball in the air keeps the spin it was struck with (backspin, slowly dying).
  const airAxis = new Vector3();
  let airRate = 0;
  let inAir = false;

  const applyFrame = (f: MatchFrame3D): void => {
    const snap = snapNext;
    snapNext = false;
    const dt = animDt;
    squads?.update(f, dt, snap);
    animDt = 0;

    // The ball: in the keeper's hands, or where the engine has it.
    let bx = f.ballX - HALF_X;
    let bz = f.ballY - HALF_Z;
    let by = Math.max(R, f.ballZ + R);
    const carried = f.owner >= 0 && squads !== null && (f.inHands || f.overhead);
    if (carried && squads) {
      if (f.inHands) squads.hands(f.owner, held);
      else squads.overhead(f.owner, held);
      bx = held.x;
      by = held.y;
      bz = held.z;
    }
    const dx = bx - lastBall.x;
    const dz = bz - lastBall.z;
    const d = Math.hypot(dx, dz);
    const flying = !carried && by - R > 0.25;
    if (!snap && !carried && d > 1e-4 && d < 30) {
      spinAxis.set(dz / d, 0, -dx / d);
      if (flying) {
        if (!inAir) {
          airAxis.copy(spinAxis).negate();
          airRate = Math.min(20, (d / Math.max(dt, 1e-3)) * 0.7);
        }
        airRate *= Math.exp(-0.4 * dt);
        ball.quaternion.premultiply(spin.setFromAxisAngle(airAxis, airRate * dt));
      } else ball.quaternion.premultiply(spin.setFromAxisAngle(spinAxis, d / R));
    }
    inAir = flying;
    ball.position.set(bx, by, bz);
    lastBall.copy(ball.position);

    // Shadows: players first, then the ball (smaller and fainter as it rises).
    blobQ.identity();
    for (let i = 0; i < 22; i++) {
      const s = f.on[i] ? tuning.shadow.player : 0;
      blobs.setMatrixAt(i, blobM.compose(blobP.set(f.px[i] - HALF_X, 0.04, f.py[i] - HALF_Z), blobQ, blobS.set(s, 1, s)));
    }
    const bs = tuning.shadow.ball * Math.max(0.4, 1 - (by - R) * 0.05);
    blobs.setMatrixAt(22, blobM.compose(blobP.set(bx, 0.045, bz), blobQ, blobS.set(bs, 1, bs)));
    blobs.instanceMatrix.needsUpdate = true;

    cam.follow(bx, bz, snap);
  };

  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h);
    cam.resize(w / h);
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let night = false;
  let floodlights = opts.scene.ground.upgrades.floodlights;
  const applyTime = (): void => {
    model.setLit(night ? stadiumTuning.view.nightSelfLit : stadiumTuning.view.daySelfLit);
    scene.background = night ? nightSky : daySky;
    (scene.fog as Fog).color.set(night ? '#1a2340' : '#d5e3ef');
    if (night) {
      sky.color.set('#c9d6ff');
      sky.groundColor.set('#2a2a30');
      sky.intensity = 0.25 + 0.6 * floodlights;
      sun.color.set('#9fb3ff');
      sun.intensity = 0.35;
    } else {
      sky.color.set('#dce8ff');
      sky.groundColor.set('#5b5340');
      sky.intensity = 1.5;
      sun.color.set('#fff1dc');
      sun.intensity = 2.4;
    }
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  };
  if (opts.scene.night) {
    night = true;
    applyTime();
  }

  let lastTime = performance.now();
  let sinceBoards = 0;
  let frames = 0;
  let fpsFrom = lastTime;
  let fps = 0;
  let raf = 0;
  let running = true;
  const loop = (): void => {
    raf = requestAnimationFrame(loop);
    const t = performance.now();
    const dt = Math.min(0.1, (t - lastTime) / 1000);
    lastTime = t;
    sinceBoards += dt;
    if (lost) return;
    if (fresh && latest) {
      applyFrame(latest);
      fresh = false;
      dirty = true;
    }
    const easing = cam.tick(dt);
    const boards = model.tick(dt) && sinceBoards >= 1 / 30;
    if (!dirty && !easing && !boards) return;
    dirty = false;
    sinceBoards = 0;
    renderer.render(scene, camera);
    frames += 1;
    if (t - fpsFrom >= 1000) {
      fps = (frames * 1000) / (t - fpsFrom);
      frames = 0;
      fpsFrom = t;
    }
  };
  raf = requestAnimationFrame(loop);

  return {
    frame(f, cut = false) {
      if (cut) snapNext = true;
      else if (lastMs >= 0) {
        const gap = f.matchMs - lastMs;
        if (gap < 0 || gap > SNAP_MS) snapNext = true;
        else animDt = Math.min(MAX_ANIM_S, animDt + gap / 1000);
      } else snapNext = true;
      if (f.matchMs !== lastMs || !latest || cut) fresh = true;
      lastMs = f.matchMs;
      latest = f;
    },
    setCamera(key, end = 0) {
      cam.set(key, end);
      dirty = true;
    },
    setNight(value) {
      if (value === night) return;
      night = value;
      applyTime();
    },
    pause() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    },
    resume() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      dirty = true;
      raf = requestAnimationFrame(loop);
    },
    stats() {
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, fps };
    },
    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      squads?.dispose();
      model.dispose();
      surroundings.dispose();
      ball.geometry.dispose();
      (ball.material as MeshLambertMaterial).dispose();
      ballMap.dispose();
      blobGeo.dispose();
      (blobs.material as MeshBasicMaterial).dispose();
      blobMap.dispose();
      daySky.dispose();
      nightSky.dispose();
      sun.dispose();
      assets.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
