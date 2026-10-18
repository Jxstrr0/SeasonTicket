/**
 * Furniture and the screens that show club data. Models come from
 * props.glb (Poly Haven, CC0); the TV, phone, credenza, crest frame,
 * whiteboard and rug are simple shapes built here.
 */
import {
  BoxGeometry,
  BufferAttribute,
  type Box3,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { TierSettings } from '../quality';
import type { HotspotId, OfficeSnapshot } from './types';
import { ScreenTexture, paintCrest, paintLaptop, paintPhone, paintTv, paintWhiteboard } from './screens';

const DESK_TOP = 0.79;

/**
 * The laptop's display ships without UVs. It is a flat panel in its local
 * x/y plane, so map the canvas straight across it (glTF UVs: v 0 is the top).
 */
function planarUv(mesh: Mesh): void {
  const g = mesh.geometry;
  if (g.getAttribute('uv')) return;
  g.computeBoundingBox();
  const box = g.boundingBox as Box3;
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const sx = box.max.x - box.min.x || 1;
  const sy = box.max.y - box.min.y || 1;
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - box.min.x) / sx;
    uv[i * 2 + 1] = (box.max.y - pos.getY(i)) / sy;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
}

export interface Hotspot {
  id: HotspotId;
  /** Meshes a tap can hit (some are invisible, larger than the prop). */
  hit: Object3D[];
  /** Where the label floats, in world space. */
  anchor: Vector3;
}

export interface Props {
  root: Group;
  hotspots: Hotspot[];
  /** Where trophies go: shelf surface heights and slot offsets, in world space. */
  shelf: { x: number; z: number; levels: number[]; slots: number[]; maxHeight: number };
  lampHead: Vector3;
  update(snap: OfficeSnapshot): Promise<void>;
  /** Sets the clock hands from the real local time. */
  tickClock(date: Date): void;
  dispose(): void;
}

function take(gltf: GLTF, name: string): Object3D | null {
  const o = gltf.scene.getObjectByName(name);
  if (!o) {
    console.warn(`office: ${name} missing from props.glb`);
    return null;
  }
  o.removeFromParent();
  return o;
}

function shadows(o: Object3D, cast: boolean): void {
  o.traverse((c) => {
    if ((c as Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = true;
    }
  });
}

function invisibleBox(w: number, h: number, d: number, x: number, y: number, z: number): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d));
  m.position.set(x, y, z);
  m.visible = false;
  return m;
}

function rugTexture(snap: OfficeSnapshot): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = snap.primary;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = snap.secondary;
    ctx.lineWidth = 18;
    ctx.strokeRect(30, 30, c.width - 60, c.height - 60);
    ctx.lineWidth = 6;
    ctx.strokeRect(62, 62, c.width - 124, c.height - 124);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    for (let i = 0; i < c.width; i += 4) ctx.fillRect(i, 0, 2, c.height);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function buildProps(gltf: GLTF, tier: TierSettings, anisotropy: number): Props {
  const root = new Group();
  root.name = 'props';
  const hotspots: Hotspot[] = [];
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const wood = own(new MeshStandardMaterial({ color: '#5a3c29', roughness: 0.55, metalness: 0 }));
  const black = own(new MeshStandardMaterial({ color: '#0d0e10', roughness: 0.35, metalness: 0.2 }));
  const alu = own(new MeshStandardMaterial({ color: '#b9bdc2', roughness: 0.35, metalness: 0.9 }));

  // Desk, with the owner's side (drawers) facing the camera at +z.
  const desk = take(gltf, 'metal_office_desk');
  if (desk) {
    shadows(desk, true);
    root.add(desk);
  }

  // Laptop: finances. The display is the primitive with the screen material.
  const laptopScreen = new ScreenTexture(512, 420, anisotropy, true);
  disposables.push(laptopScreen);
  const laptop = take(gltf, 'classic_laptop');
  if (laptop) {
    laptop.position.set(0.35, DESK_TOP, 0.12);
    laptop.rotation.y = -0.32;
    shadows(laptop, true);
    let display: Mesh | null = null;
    laptop.traverse((c) => {
      const m = c as Mesh;
      if (!m.isMesh) return;
      const name = (m.material as Material).name ?? '';
      if (name === 'classic_laptop_screen') display ??= m;
    });
    if (display) {
      planarUv(display as Mesh);
      (display as Mesh).material = own(new MeshBasicMaterial({ map: laptopScreen.texture, toneMapped: false }));
    }
    root.add(laptop);
    hotspots.push({
      id: 'laptop',
      hit: [laptop, invisibleBox(0.5, 0.45, 0.4, 0.35, DESK_TOP + 0.22, 0.12)],
      anchor: new Vector3(0.35, DESK_TOP + 0.62, 0.05),
    });
  }

  // Phone: transfer offers. Lies flat; a red light blinks when bids are in.
  const phone = new Group();
  phone.position.set(-0.52, DESK_TOP, 0.22);
  phone.rotation.y = 0.18;
  const phoneBody = new Mesh(own(new RoundedBoxGeometry(0.075, 0.009, 0.155, 2, 0.006)), black);
  phoneBody.position.y = 0.0045;
  phoneBody.castShadow = true;
  phone.add(phoneBody);
  const phoneScreen = new ScreenTexture(128, 256, anisotropy);
  disposables.push(phoneScreen);
  const phoneDisplay = new Mesh(
    own(new PlaneGeometry(0.066, 0.138)),
    own(new MeshBasicMaterial({ map: phoneScreen.texture, toneMapped: false })),
  );
  phoneDisplay.rotation.x = -Math.PI / 2;
  phoneDisplay.position.y = 0.0095;
  phone.add(phoneDisplay);
  const ledMat = own(new MeshBasicMaterial({ color: '#ff3b3b', toneMapped: false }));
  const led = new Mesh(own(new SphereGeometry(0.004, 8, 6)), ledMat);
  led.position.set(0.026, 0.01, -0.07);
  phone.add(led);
  root.add(phone);
  hotspots.push({
    id: 'phone',
    hit: [invisibleBox(0.22, 0.12, 0.28, -0.52, DESK_TOP + 0.05, 0.22)],
    anchor: new Vector3(-0.52, DESK_TOP + 0.16, 0.22),
  });

  // Clipboard: the squad.
  const clip = take(gltf, 'clipboard');
  if (clip) {
    clip.position.set(-0.2, DESK_TOP, 0.24);
    clip.rotation.y = 0.22;
    shadows(clip, true);
    root.add(clip);
    hotspots.push({
      id: 'clipboard',
      hit: [invisibleBox(0.3, 0.1, 0.4, -0.2, DESK_TOP + 0.04, 0.24)],
      anchor: new Vector3(-0.2, DESK_TOP + 0.16, 0.24),
    });
  }

  const lamp = take(gltf, 'desk_lamp_arm_01');
  if (lamp) {
    lamp.position.set(-0.82, DESK_TOP + 0.09, -0.22);
    lamp.rotation.y = 0.6;
    shadows(lamp, true);
    lamp.traverse((c) => {
      const m = c as Mesh;
      if (m.isMesh && (m.material as Material).name === 'desk_lamp_arm_01_light') {
        const mat = (m.material as MeshStandardMaterial).clone();
        mat.emissive.set('#ffd9a0');
        mat.emissiveIntensity = 3;
        m.material = own(mat);
        m.castShadow = false;
      }
    });
    root.add(lamp);
  }

  if (tier.detail >= 1) {
    const plant = take(gltf, 'potted_plant_04');
    if (plant) {
      plant.getObjectByName('potted_plant_04_ground')?.removeFromParent();
      plant.position.set(0.82, DESK_TOP, -0.26);
      shadows(plant, true);
      root.add(plant);
    }
  }

  // Visitor's armchair across the desk.
  const chair = take(gltf, 'modern_arm_chair_01');
  if (chair) {
    chair.position.set(0.25, 0, -1.15);
    chair.rotation.y = -0.15;
    shadows(chair, true);
    root.add(chair);
  }

  // Far wall: TV (league table) over a credenza, the framed crest, the clock.
  const tv = new Group();
  tv.position.set(-1.2, 1.6, -4.96);
  const tvBody = new Mesh(own(new BoxGeometry(1.62, 0.92, 0.05)), black);
  tvBody.position.z = 0.025;
  tvBody.castShadow = true;
  tv.add(tvBody);
  const tvScreen = new ScreenTexture(1024, 576, anisotropy);
  disposables.push(tvScreen);
  const tvDisplay = new Mesh(
    own(new PlaneGeometry(1.56, 0.86)),
    own(new MeshBasicMaterial({ map: tvScreen.texture, toneMapped: false })),
  );
  tvDisplay.position.z = 0.0505;
  tv.add(tvDisplay);
  root.add(tv);
  hotspots.push({ id: 'tv', hit: [tvBody], anchor: new Vector3(-1.2, 2.25, -4.85) });

  const credenza = new Mesh(own(new RoundedBoxGeometry(1.8, 0.55, 0.45, 2, 0.02)), wood);
  credenza.position.set(-1.2, 0.275, -4.76);
  credenza.castShadow = true;
  credenza.receiveShadow = true;
  root.add(credenza);

  const crestFrame = new Group();
  crestFrame.position.set(0.55, 1.65, -4.97);
  const frame = new Mesh(own(new BoxGeometry(0.74, 0.74, 0.04)), wood);
  frame.position.z = 0.02;
  frame.castShadow = true;
  crestFrame.add(frame);
  const crestTex = new ScreenTexture(512, 512, anisotropy);
  disposables.push(crestTex);
  const crestPlane = new Mesh(
    own(new PlaneGeometry(0.62, 0.62)),
    own(new MeshStandardMaterial({ map: crestTex.texture, roughness: 0.8, metalness: 0 })),
  );
  crestPlane.position.z = 0.041;
  crestFrame.add(crestPlane);
  root.add(crestFrame);

  const hands: { pivot: Object3D; base: number }[] = [];
  const clock = take(gltf, 'wall_clock');
  if (clock) {
    clock.position.set(2.4, 2.5, -4.98);
    // Each hand turns about the clock centre (the group origin).
    const base: Record<string, number> = {
      wall_clock_hours_hand: 306.8,
      wall_clock_minute_hand: 57.0,
      wall_clock_second_hand: 170.5,
    };
    for (const [name, deg] of Object.entries(base)) {
      const hand = clock.getObjectByName(name);
      if (!hand) continue;
      const pivot = new Object3D();
      clock.add(pivot);
      pivot.add(hand);
      hands.push({ pivot, base: deg });
    }
    root.add(clock);
  }

  // Right wall: the tactics whiteboard and the trophy shelves.
  const boardTex = new ScreenTexture(768, 512, anisotropy);
  disposables.push(boardTex);
  const board = new Group();
  board.position.set(3.97, 1.5, -1.6);
  board.rotation.y = -Math.PI / 2;
  const boardFace = new Mesh(
    own(new PlaneGeometry(1.5, 1.0)),
    own(new MeshStandardMaterial({ map: boardTex.texture, roughness: 0.25, metalness: 0 })),
  );
  boardFace.position.z = 0.02;
  board.add(boardFace);
  const rim = 0.025;
  for (const [w, h, x, y] of [
    [1.5 + rim * 2, rim, 0, 0.5 + rim / 2],
    [1.5 + rim * 2, rim, 0, -0.5 - rim / 2],
    [rim, 1.0, -0.75 - rim / 2, 0],
    [rim, 1.0, 0.75 + rim / 2, 0],
  ]) {
    const e = new Mesh(own(new BoxGeometry(w, h, 0.03)), alu);
    e.position.set(x, y, 0.02);
    board.add(e);
  }
  const tray = new Mesh(own(new BoxGeometry(0.6, 0.02, 0.06)), alu);
  tray.position.set(0.3, -0.53, 0.05);
  board.add(tray);
  root.add(board);
  hotspots.push({ id: 'whiteboard', hit: [boardFace], anchor: new Vector3(3.9, 2.12, -1.6) });

  const shelves = take(gltf, 'wooden_display_shelves_01');
  const shelfX = 3.78;
  const shelfZ = -3.8;
  if (shelves) {
    shelves.position.set(shelfX, 0, shelfZ);
    shelves.rotation.y = Math.PI;
    shadows(shelves, true);
    root.add(shelves);
    hotspots.push({
      id: 'cabinet',
      hit: [invisibleBox(0.45, 1.6, 1.15, shelfX, 0.8, shelfZ)],
      anchor: new Vector3(shelfX - 0.1, 1.78, shelfZ),
    });
  }

  // The office grows with the club. Each level's items are built now and shown later.
  const byLevel: Object3D[][] = [[], [], [], []];
  const sofa = take(gltf, 'Sofa_01');
  if (sofa) {
    sofa.position.set(-3.05, 0, -4.6);
    shadows(sofa, true);
    byLevel[1].push(sofa);
  }
  const table = take(gltf, 'modern_coffee_table_01');
  if (table) {
    table.position.set(-3.05, 0, -3.72);
    table.rotation.y = Math.PI / 2;
    shadows(table, true);
    byLevel[1].push(table);
  }
  const art = take(gltf, 'hanging_picture_frame_02');
  if (art) {
    art.position.set(3.98, 1.8, 0.55);
    art.rotation.y = -Math.PI / 2;
    shadows(art, false);
    byLevel[1].push(art);
  }
  const ceilingLamp = take(gltf, 'modern_ceiling_lamp_01');
  if (ceilingLamp) {
    ceilingLamp.position.set(0, 1.83, -2.4);
    shadows(ceilingLamp, false);
    root.add(ceilingLamp);
  }
  const rugMat = own(new MeshStandardMaterial({ roughness: 0.95, metalness: 0 }));
  const rug = new Mesh(own(new PlaneGeometry(3.2, 2.4)), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, -0.7);
  rug.receiveShadow = true;
  byLevel[3].push(rug);
  if (tier.detail >= 1) {
    const ball = take(gltf, 'football');
    if (ball) {
      ball.getObjectByName('football_deflated')?.removeFromParent();
      ball.position.set(1.35, 0, -0.85);
      shadows(ball, true);
      byLevel[3].push(ball);
    }
  }
  for (const items of byLevel) for (const o of items) root.add(o);

  let lastRug = '';
  let crestKey = '';
  return {
    root,
    hotspots,
    shelf: { x: shelfX, z: shelfZ, levels: [1.17, 0.79, 0.41], slots: [-0.36, -0.12, 0.12, 0.36], maxHeight: 0.33 },
    lampHead: new Vector3(-0.7, DESK_TOP + 0.6, 0.02),
    async update(snap) {
      paintLaptop(laptopScreen, snap);
      paintTv(tvScreen, snap);
      paintWhiteboard(boardTex, snap);
      paintPhone(phoneScreen, snap);
      led.visible = snap.bids > 0 || !!snap.deadline;
      byLevel.forEach((items, lvl) => {
        for (const o of items) o.visible = snap.level >= lvl;
      });
      tv.scale.setScalar(snap.level >= 2 ? 1.25 : 1);
      tv.position.y = snap.level >= 2 ? 1.68 : 1.6;
      const rugKey = `${snap.primary}${snap.secondary}`;
      if (snap.level >= 3 && rugKey !== lastRug) {
        lastRug = rugKey;
        rugMat.map?.dispose();
        rugMat.map = rugTexture(snap);
        rugMat.needsUpdate = true;
      }
      const ck = `${snap.crestSvg}${snap.clubName}`;
      if (ck !== crestKey) {
        crestKey = ck;
        await paintCrest(crestTex, snap);
      }
    },
    tickClock(date) {
      const s = date.getSeconds();
      const m = date.getMinutes() + s / 60;
      const h = (date.getHours() % 12) + m / 60;
      const target = [h * 30, m * 6, s * 6];
      hands.forEach((hand, i) => {
        hand.pivot.rotation.z = -((target[i] - hand.base) * Math.PI) / 180;
      });
    },
    dispose() {
      rugMat.map?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
