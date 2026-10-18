/**
 * The HQ Office: a 3D room the owner looks around from behind the desk.
 * Objects in the room open the menus, the window shows the stadium, and
 * visitors walk in with news. This module is loaded with a dynamic import
 * so the plain menus never download three.js.
 */
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Raycaster,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import officeTuning from '../../data/tuning/office.json';
import { Assets } from '../assets';
import { QUALITY_TIERS, type QualityTier } from '../quality';
import { LookControls, type LookConfig } from './controls';
import { buildOutside } from './outside';
import { buildProps, type Hotspot } from './props';
import { ROOM, buildRoom } from './room';
import { TrophyCase } from './trophies';
import type { HotspotId, OfficePick, OfficeSnapshot } from './types';
import { Visitors } from './visitors';

export type { HotspotId, OfficePick, OfficeSnapshot } from './types';

export interface OfficeOptions {
  tier: QualityTier;
  onPick(pick: OfficePick): void;
  /** 0-1 while the first load runs. */
  onProgress?(fraction: number): void;
  /** The browser dropped the WebGL context (low memory, backgrounded tab). */
  onLost?(): void;
}

export interface OfficeHandle {
  update(snap: OfficeSnapshot): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

const CAM = officeTuning.camera;
/** Rough download sizes, for the loading bar. */
const PROPS_BYTES = 3_300_000;

const LABELS: Record<HotspotId, string> = {
  laptop: 'Finances',
  phone: 'Fan feed',
  tv: 'News',
  window: 'Stadium',
  whiteboard: 'Tactics',
  clipboard: 'Squad',
  door: 'Inbox',
  cabinet: 'Trophies',
};

interface Label {
  el: HTMLButtonElement;
  text: HTMLSpanElement;
  anchor: Vector3;
}

export async function createOffice(container: HTMLElement, opts: OfficeOptions): Promise<OfficeHandle> {
  const tier = QUALITY_TIERS[opts.tier];
  const renderer = new WebGLRenderer({ antialias: tier.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'office-canvas';
  container.appendChild(canvas);

  const labelLayer = document.createElement('div');
  labelLayer.className = 'office-labels';
  container.appendChild(labelLayer);

  let lost = false;
  const onLost = (e: Event): void => {
    e.preventDefault();
    lost = true;
    opts.onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  const scene = new Scene();
  scene.background = new Color('#0b1020');
  const camera = new PerspectiveCamera(CAM.fov, 1, 0.05, 2000);
  camera.position.fromArray(CAM.position);

  const pmrem = new PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.35;

  const assets = new Assets(renderer);
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), tier.detail >= 2 ? 8 : 4);

  let propsBytes = 0;
  let texturesDone = 0;
  const report = (): void => opts.onProgress?.(Math.min(0.98, 0.8 * Math.min(1, propsBytes / PROPS_BYTES) + 0.2 * texturesDone));
  report();
  const [room, gltf] = await Promise.all([
    buildRoom(assets, tier, anisotropy).then((r) => {
      texturesDone = 1;
      report();
      return r;
    }),
    assets.model('assets/office/props.glb', (n) => {
      propsBytes = n;
      report();
    }),
  ]);
  const props = buildProps(gltf, tier, anisotropy);
  const trophies = new TrophyCase(props.shelf, tier.detail);
  let dirty = true;
  const outside = buildOutside(tier, camera.position, () => {
    dirty = true;
  });
  scene.add(room.root, props.root, trophies.root, outside.root);

  // Lighting: a warm ceiling spot over the desk, the desk lamp, a cool fill
  // from the dusk window, and a soft sky/floor ambient.
  scene.add(new HemisphereLight('#b8c4ff', '#3a2a20', 0.55));
  const spot = new SpotLight('#ffe2c0', 22, 9, 0.95, 0.6, 1.6);
  spot.position.set(0, 2.92, -0.6);
  spot.target.position.set(0, 0, -0.9);
  spot.castShadow = tier.shadows;
  spot.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  spot.shadow.camera.near = 0.3;
  spot.shadow.camera.far = 8;
  scene.add(spot, spot.target);
  const back = new SpotLight('#ffd9b0', 10, 8, 1.1, 0.8, 1.6);
  back.position.set(0, 2.92, -3.6);
  back.target.position.set(0, 0, -4.2);
  scene.add(back, back.target);
  const lamp = new PointLight('#ffc98a', 1.4, 2.6, 1.8);
  lamp.position.copy(props.lampHead).add(new Vector3(0, -0.06, 0));
  scene.add(lamp);
  const dusk = new DirectionalLight('#8fa2ff', 0.55);
  dusk.position.set(-8, 3, -2);
  dusk.target.position.set(0, 0.5, -1.5);
  scene.add(dusk, dusk.target);

  const castShadows = tier.shadows && tier.detail >= 1;
  const visitors = new Visitors(assets, room.doorPivot, castShadows, () => {
    dirty = true;
  });
  scene.add(visitors.root);

  // Post-processing on High only: a gentle bloom on lamps, floodlights and screens.
  let composer: EffectComposer | null = null;
  if (tier.bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new Vector2(256, 256), 0.35, 0.5, 0.85));
    composer.addPass(new OutputPass());
  }

  // Labels for every hotspot, plus the visitor's speech bubble.
  const hotspots: Hotspot[] = [
    ...props.hotspots,
    { id: 'window', hit: [room.windowHit], anchor: new Vector3(ROOM.minX + 0.1, 2.0, -1.5) },
    { id: 'door', hit: [room.doorHit], anchor: new Vector3(2.4, 2.3, ROOM.minZ + 0.1) },
  ];
  const owner = new Map<Object3D, HotspotId>();
  for (const h of hotspots) for (const o of h.hit) owner.set(o, h.id);
  const labels = new Map<HotspotId, Label>();
  const makeLabel = (cls: string, onTap: () => void): Omit<Label, 'anchor'> => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `office-label ${cls}`;
    const text = document.createElement('span');
    el.appendChild(text);
    el.addEventListener('click', onTap);
    labelLayer.appendChild(el);
    return { el, text };
  };
  for (const h of hotspots) {
    const l = makeLabel(`office-label-${h.id}`, () => opts.onPick({ kind: 'hotspot', id: h.id }));
    l.text.textContent = LABELS[h.id];
    labels.set(h.id, { ...l, anchor: h.anchor });
  }
  let visitorMail = '';
  const bubble = makeLabel('office-bubble', () => {
    if (visitorMail) opts.onPick({ kind: 'mail', id: visitorMail });
  });

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const tap = (x: number, y: number): void => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const targets = [...owner.keys(), ...visitors.hits()];
    const hit = raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;
    for (let o: Object3D | null = hit.object; o; o = o.parent) {
      if (typeof o.userData.mailId === 'string') return opts.onPick({ kind: 'mail', id: o.userData.mailId });
      const id = owner.get(o);
      if (id) return opts.onPick({ kind: 'hotspot', id });
    }
  };
  const controls = new LookControls(canvas, CAM as LookConfig, tap, () => {
    dirty = true;
  });

  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    const vfov = camera.aspect < 1 ? CAM.fovPortrait : CAM.fov;
    const capped = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(CAM.hfovMax / 2)) / camera.aspect));
    camera.fov = Math.min(vfov, capped);
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const projected = new Vector3();
  /** Pins a label to its 3D anchor. `clampTop` keeps it in view when the anchor is above the frame. */
  const place = (el: HTMLElement, anchor: Vector3, w: number, h: number, clampTop = false): void => {
    projected.copy(anchor).project(camera);
    const behind = projected.z > 1 || projected.z < -1;
    const x = (projected.x * 0.5 + 0.5) * w;
    let y = (-projected.y * 0.5 + 0.5) * h;
    if (clampTop) y = Math.max(y, 28);
    const off = behind || x < -40 || x > w + 40 || y < -20 || y > h + 20;
    el.style.visibility = off ? 'hidden' : 'visible';
    if (!off) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  };
  const placeLabels = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    for (const l of labels.values()) place(l.el, l.anchor, w, h);
    const v = visitors.label();
    bubble.el.hidden = !v;
    if (v) {
      if (visitorMail !== v.mailId) {
        visitorMail = v.mailId;
        bubble.text.textContent = v.text;
      }
      place(bubble.el, v.anchor, w, h, true);
    } else {
      visitorMail = '';
    }
  };

  let lastTime = performance.now();
  let lastSecond = -1;
  let frame = 0;
  let running = true;
  const loop = (): void => {
    frame = requestAnimationFrame(loop);
    const t = performance.now();
    const dt = Math.min(0.05, (t - lastTime) / 1000);
    lastTime = t;
    if (lost) return;
    let moving = controls.update(dt);
    moving = visitors.update(dt, camera.position) || moving;
    const now = new Date();
    if (now.getSeconds() !== lastSecond) {
      lastSecond = now.getSeconds();
      props.tickClock(now);
      dirty = true;
    }
    if (!dirty && !moving) return;
    dirty = false;
    controls.apply(camera);
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
    placeLabels();
  };
  props.tickClock(new Date());
  frame = requestAnimationFrame(loop);
  opts.onProgress?.(1);

  let lastKey = '';
  return {
    update(snap) {
      const door = labels.get('door');
      if (door) door.text.textContent = snap.unread > 0 ? `Inbox (${snap.unread})` : 'Inbox';
      const phone = labels.get('phone');
      if (phone) phone.text.textContent = snap.deadline ? 'War room' : snap.bids > 0 ? `Offers (${snap.bids})` : 'Fan feed';
      const key = JSON.stringify(snap);
      if (key === lastKey) return;
      lastKey = key;
      trophies.set(snap.trophies);
      outside.update(snap);
      visitors.set(snap.visitor, snap);
      void props.update(snap).then(() => {
        dirty = true;
      });
      void room.setLevel(snap.level).then(() => {
        dirty = true;
      });
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
      controls.dispose();
      canvas.removeEventListener('webglcontextlost', onLost);
      visitors.dispose();
      trophies.dispose();
      outside.dispose();
      props.dispose();
      composer?.dispose();
      scene.traverse((o) => {
        const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
        else m.material?.dispose();
      });
      envTex.dispose();
      assets.dispose();
      renderer.dispose();
      // Hand the GPU context back now: a closed view's context otherwise lives on until the
      // browser collects it, and phones only allow a handful at a time.
      renderer.forceContextLoss();
      canvas.remove();
      labelLayer.remove();
    },
  };
}
