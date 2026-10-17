/**
 * The 22 players on the 3D pitch. Each is a clone of the office's base body (Quaternius'
 * Universal Base Characters, CC0) running the Universal Animation Library's gaits (CC0).
 * A shader paints the kit on by body region, as the office paints suits, and hair and
 * skin come from a hash of the player's id, so a player looks the same every match.
 *
 * Gaits blend by ground speed: idle, walk, jog, sprint. The three running clips share one
 * stride phase, so blending between them never puts the legs out of step.
 */
import {
  AnimationClip,
  AnimationMixer,
  Color,
  Group,
  LoopRepeat,
  Matrix4,
  MeshLambertMaterial,
  Skeleton,
  VectorKeyframeTrack,
  type AnimationAction,
  type Bone,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import tuning from '../../data/tuning/match3d.json';
import type { Assets } from '../assets';
import { addRest, restoreBoneNames, splitTrack } from '../rig';
import type { KitColours, MatchFrame3D, MatchScene3D } from './types';

const P = tuning.players;
const K = tuning.kit;
const L = tuning.looks;
const HAIR_IDS = ['hair_buzzed', 'hair_simpleparted', 'hair_long', 'hair_beard'];
/** Stadium space: x along the pitch from the centre spot, z towards the main stand. */
const HALF_X = 52.5;
const HALF_Z = 34;

export interface PlayerTemplates {
  body: Object3D;
  hair: Map<string, SkinnedMesh[]>;
  idle: AnimationClip;
  gaits: { clip: AnimationClip; speed: number; stride: number }[];
}

/** Loads the body, hair and gaits once per view. */
export async function loadPlayerTemplates(assets: Assets): Promise<PlayerTemplates> {
  const [people, anims] = await Promise.all([assets.model('assets/office/people.glb'), assets.model('assets/match/anims.glb')]);
  people.scene.updateMatrixWorld(true);
  restoreBoneNames(people);
  const body = people.scene.getObjectByName('body_m');
  if (!body) throw new Error('people.glb is missing body_m');
  const bones = new Set<string>();
  const inv = new Matrix4().copy(body.matrixWorld).invert();
  body.traverse((o) => {
    if ((o as Bone).isBone) bones.add(o.name);
    const m = o as SkinnedMesh;
    if (m.isSkinnedMesh && !m.geometry.getAttribute('aRest')) addRest(m, inv);
  });
  const hair = new Map<string, SkinnedMesh[]>();
  for (const id of HAIR_IDS) {
    const list: SkinnedMesh[] = [];
    people.scene.getObjectByName(id)?.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) list.push(o as SkinnedMesh);
    });
    hair.set(id, list);
  }
  const clip = (name: string): AnimationClip => {
    const src = anims.animations.find((a) => a.name === name);
    if (!src) throw new Error(`match anims are missing ${name}`);
    const tracks = [];
    for (const t of src.tracks) {
      const [node, prop] = splitTrack(t.name);
      if (!bones.has(node)) continue;
      if (prop === 'quaternion') tracks.push(t);
      else if (prop === 'position' && /pelvis/i.test(node)) {
        // Keep the bob, drop any drift: the engine moves the player.
        const v = t.values.slice();
        for (let i = 3; i < v.length; i += 3) {
          v[i] = v[0];
          v[i + 2] = v[2];
        }
        tracks.push(new VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v)));
      }
    }
    return new AnimationClip(name, src.duration, tracks);
  };
  const gaits = P.gaits.map((g) => {
    const c = clip(g.clip);
    return { clip: c, speed: g.speed, stride: g.speed * c.duration };
  });
  return { body, hair, idle: clip(P.idle), gaits };
}

/** Small seeded hash so the same id always gives the same looks. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let x = h >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length];
}

/** A number as a GLSL float literal (a bare "1" is an int there). */
const glf = (n: number): string => n.toFixed(4);

const KIT_VERT = /* glsl */ `
  attribute vec3 aRest;
  varying vec3 vRest;
`;

const KIT_FRAG = /* glsl */ `
  varying vec3 vRest;
  uniform vec3 uSkin; uniform vec3 uShirt; uniform vec3 uTrim; uniform vec3 uShorts;
  uniform vec3 uSocks; uniform vec3 uBoots; uniform vec3 uHands; uniform float uGloved;
  uniform float uSleeve;
`;

const KIT_PAINT = /* glsl */ `
  {
    float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.21;
    float ax = abs(vRest.x);
    float y = vRest.y;
    vec3 cloth = uShirt;
    bool skin = false;
    if (y < ${glf(K.bootsTo)}) cloth = uBoots;
    else if (y < ${glf(K.socksTo)}) cloth = uSocks;
    else if (y < ${glf(K.shortsFrom)}) skin = true;
    else if (y < ${glf(K.waist)}) cloth = uShorts;
    else if (y > 1.3 && ax > 0.2) {
      // The arms, out to the side in the rest pose.
      if (ax > uSleeve) {
        if (uGloved > 0.5) cloth = uHands; else skin = true;
      } else if (ax > uSleeve - ${glf(K.cuff)}) cloth = uTrim;
    } else if (y > ${glf(K.neck)}) skin = true;
    else if (y > ${glf(K.neck - K.collar)}) cloth = uTrim;
    diffuseColor.rgb = skin ? uSkin * clamp(lum, 0.6, 1.3) : cloth * mix(1.0, lum, 0.25);
  }
`;

interface Look {
  skin: string;
  hairColor: string;
  style: string[];
}

function lookFor(id: string): Look {
  const r = seeded(id);
  return { skin: pick(r, L.skinTones), hairColor: pick(r, L.hairColors), style: pick(r, L.styles) };
}

class Player {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly idle: AnimationAction;
  private readonly gaits: AnimationAction[];
  private readonly bones = new Map<string, Bone>();
  private readonly body: Object3D;
  private readonly kit: MeshLambertMaterial;
  private readonly hairMat: MeshLambertMaterial;
  private readonly uniforms: Record<string, { value: Color | number }>;
  private hair: SkinnedMesh[] = [];
  private person = '';
  private heading = 0;
  private speed = 0;
  private phase = 0;
  private placed = false;

  constructor(
    private readonly t: PlayerTemplates,
    readonly keeper: boolean,
  ) {
    this.body = cloneSkinned(t.body);
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.root.add(this.body);
    this.uniforms = {
      uSkin: { value: new Color() },
      uShirt: { value: new Color() },
      uTrim: { value: new Color() },
      uShorts: { value: new Color() },
      uSocks: { value: new Color() },
      uBoots: { value: new Color(K.boots) },
      uHands: { value: new Color(K.gloves) },
      uGloved: { value: keeper ? 1 : 0 },
      uSleeve: { value: keeper ? K.keeperSleeveTo : K.sleeveTo },
    };
    let kit: MeshLambertMaterial | null = null;
    const drop: Object3D[] = [];
    this.body.traverse((o) => {
      if ((o as Bone).isBone) this.bones.set(o.name, o as Bone);
      const m = o as SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      // Eyes and brows are too small to see from the stands; skip their draw calls.
      if (/eye/i.test(m.name) || /brow/i.test(m.name)) {
        drop.push(m);
        return;
      }
      m.frustumCulled = false;
      kit ??= this.kitMaterial(m.material as MeshStandardMaterial);
      m.material = kit;
    });
    for (const o of drop) o.removeFromParent();
    if (!kit) throw new Error('body_m has no body mesh');
    this.kit = kit;
    this.hairMat = new MeshLambertMaterial({ color: '#000000' });
    const src = t.hair.get('hair_buzzed')?.[0]?.material as MeshStandardMaterial | undefined;
    if (src?.map) this.hairMat.map = src.map;

    this.mixer = new AnimationMixer(this.body);
    this.idle = this.mixer.clipAction(t.idle).setLoop(LoopRepeat, Infinity);
    this.idle.play();
    this.gaits = t.gaits.map((g) => {
      const a = this.mixer.clipAction(g.clip).setLoop(LoopRepeat, Infinity);
      // Running clips are driven by the shared stride phase, not the mixer's clock.
      a.timeScale = 0;
      a.setEffectiveWeight(0);
      a.play();
      return a;
    });
    // Players start their idle at different points, so they don't sway together.
    this.idle.time = Math.random() * t.idle.duration;
  }

  private kitMaterial(src: MeshStandardMaterial): MeshLambertMaterial {
    const mat = new MeshLambertMaterial({ map: src.map ?? null, color: src.map ? '#ffffff' : src.color });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${KIT_VERT}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${KIT_FRAG}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${KIT_PAINT}`);
    };
    mat.customProgramCacheKey = () => 'match-kit';
    return mat;
  }

  /** Dresses the player for person `id` in `kit`. */
  dress(id: string, kit: KitColours): void {
    const u = this.uniforms;
    (u.uShirt.value as Color).set(kit.shirt);
    (u.uTrim.value as Color).set(kit.trim);
    (u.uShorts.value as Color).set(kit.shorts);
    (u.uSocks.value as Color).set(kit.socks);
    if (id === this.person) return;
    this.person = id;
    const look = lookFor(id || 'nobody');
    (u.uSkin.value as Color).set(look.skin);
    this.hairMat.color.set(look.hairColor).multiplyScalar(1.6);
    for (const h of this.hair) h.removeFromParent();
    this.hair = [];
    for (const hid of look.style) {
      for (const h of this.t.hair.get(hid) ?? []) {
        const hair = h.clone() as SkinnedMesh;
        const list = h.skeleton.bones.map((b) => this.bones.get(b.name) ?? b);
        hair.bind(new Skeleton(list, h.skeleton.boneInverses), h.bindMatrix);
        hair.material = this.hairMat;
        hair.frustumCulled = false;
        this.body.add(hair);
        this.hair.push(hair);
      }
    }
  }

  /** Moves to pitch point (px, py), running at (vx, vy), facing (fx, fz) when standing. */
  update(dt: number, px: number, py: number, vx: number, vy: number, ballX: number, ballZ: number, snap: boolean): void {
    const x = px - HALF_X;
    const z = py - HALF_Z;
    this.root.position.set(x, 0, z);
    const s = Math.hypot(vx, vy);
    const k = 1 - Math.exp(-dt * 8);
    this.speed = snap || !this.placed ? s : this.speed + (s - this.speed) * k;
    const target = s > P.faceRunAt ? Math.atan2(vx, vy) : Math.atan2(ballX - x, ballZ - z);
    if (snap || !this.placed) this.heading = target;
    else {
      const diff = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      this.heading += diff * Math.min(1, P.turnRate * dt);
    }
    this.placed = true;
    this.root.rotation.y = this.heading;
    this.animate(dt);
  }

  private animate(dt: number): void {
    const g = this.t.gaits;
    const s = this.speed;
    let idleW = 0;
    const w = [0, 0, 0];
    if (s <= P.standAt) idleW = 1;
    else if (s < g[0].speed) {
      const f = (s - P.standAt) / (g[0].speed - P.standAt);
      idleW = 1 - f;
      w[0] = f;
    } else if (s >= g[g.length - 1].speed) w[g.length - 1] = 1;
    else {
      for (let i = 0; i < g.length - 1; i++) {
        if (s >= g[i].speed && s < g[i + 1].speed) {
          const f = (s - g[i].speed) / (g[i + 1].speed - g[i].speed);
          w[i] = 1 - f;
          w[i + 1] = f;
        }
      }
    }
    // Strides per second: ground speed over the blended stride length.
    let stride = 0;
    let sum = 0;
    for (let i = 0; i < g.length; i++) {
      stride += w[i] * g[i].stride;
      sum += w[i];
    }
    if (sum > 0) {
      stride /= sum;
      const ground = Math.min(Math.max(s, P.timeScale[0] * g[0].speed), P.timeScale[1] * g[g.length - 1].speed);
      this.phase = (this.phase + (ground / stride) * dt) % 1;
    }
    this.idle.setEffectiveWeight(idleW);
    for (let i = 0; i < this.gaits.length; i++) {
      const a = this.gaits[i];
      a.setEffectiveWeight(w[i]);
      a.time = this.phase * g[i].clip.duration;
    }
    this.mixer.update(dt);
  }

  set visible(v: boolean) {
    this.root.visible = v;
    if (!v) this.placed = false;
  }

  /** Where the keeper holds the ball (stadium space). */
  hands(out: { x: number; y: number; z: number }): void {
    out.x = this.root.position.x + Math.sin(this.heading) * P.heldBall.forward;
    out.z = this.root.position.z + Math.cos(this.heading) * P.heldBall.forward;
    out.y = P.heldBall.height;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
    this.kit.dispose();
    this.hairMat.dispose();
    this.root.removeFromParent();
  }
}

export class Squads {
  readonly root = new Group();
  private readonly players: Player[] = [];
  private shown = '';

  constructor(t: PlayerTemplates, private scene: MatchScene3D) {
    this.root.name = 'players';
    for (let i = 0; i < 22; i++) {
      const p = new Player(t, i % 11 === 0);
      p.visible = false;
      this.players.push(p);
      this.root.add(p.root);
    }
  }

  setScene(scene: MatchScene3D): void {
    this.scene = scene;
    this.shown = '';
  }

  /** Places everyone for frame `f`, `dt` match seconds after the last one. */
  update(f: MatchFrame3D, dt: number, snap: boolean): void {
    const ballX = f.ballX - HALF_X;
    const ballZ = f.ballY - HALF_Z;
    // Re-dress only when someone new comes on.
    let key = '';
    for (let i = 0; i < 22; i++) key += `${f.who[i]},`;
    const redress = key !== this.shown;
    this.shown = key;
    for (let i = 0; i < 22; i++) {
      const p = this.players[i];
      const on = f.on[i] === 1;
      p.visible = on;
      if (!on) continue;
      const side = i < 11 ? 0 : 1;
      if (redress) p.dress(this.scene.people[f.who[i]] ?? '', p.keeper ? this.scene.keepers[side] : this.scene.kits[side]);
      p.update(dt, f.px[i], f.py[i], f.vx[i], f.vy[i], ballX, ballZ, snap);
    }
  }

  /** The keeper's hands, for a ball he is holding. */
  hands(i: number, out: { x: number; y: number; z: number }): void {
    this.players[i]?.hands(out);
  }

  dispose(): void {
    for (const p of this.players) p.dispose();
    this.players.length = 0;
    this.root.removeFromParent();
  }
}
