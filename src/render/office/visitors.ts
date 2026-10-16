/**
 * People who walk into the office: the head coach, agents, sponsors,
 * reporters and lenders. Each visitor stands for an unread inbox message;
 * tapping them opens it.
 *
 * Bodies and hair are Quaternius' Universal Base Characters (CC0) and the
 * moves are from their Universal Animation Library (CC0). The base bodies
 * have no clothes, so a small shader paints an outfit on by body region:
 * shoes, trousers, jacket, shirt and tie, with skin on the hands and head.
 */
import {
  AnimationClip,
  AnimationMixer,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LoopRepeat,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Skeleton,
  Vector3,
  type AnimationAction,
  type Bone,
  type Material,
  type SkinnedMesh,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import officeTuning from '../../data/tuning/office.json';
import type { Assets } from '../assets';
import type { OfficeSnapshot, OfficeVisitorCall } from './types';

interface RoleLook {
  label: string;
  walk: string;
  jackets: string[];
  trousers: string;
  shirt: string;
  ties: (string | null)[];
}

const V = officeTuning.visitors;
const ROLES = V.roles as Record<string, RoleLook>;

/** Walk in from the corridor, round the armchair, stop across the desk. */
const PATH_IN: [number, number][] = [
  [2.4, -5.9],
  [2.4, -4.5],
  [-0.55, -2.45],
  [-0.75, -1.45],
];
const DOOR_POINT = new Vector3(2.4, 0, -5);
const DOOR_OPEN = -1.4;

/** Body proportions in metres, measured from the models' rest pose. */
const BODIES = {
  m: { node: 'body_m', waist: 1.0, neck: 1.5, wrist: 0.66, hair: ['hair_buzzed', 'hair_simpleparted', 'hair_long'] },
  f: { node: 'body_f', waist: 0.98, neck: 1.46, wrist: 0.59, hair: ['hair_long', 'hair_buns', 'hair_simpleparted'] },
} as const;
type BodyKind = keyof typeof BODIES;

/** Small seeded hash so the same message always brings the same person. */
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

const CLOTHES_VERT = /* glsl */ `
  attribute vec3 aRest;
  varying vec3 vRest;
`;

const CLOTHES_FRAG = /* glsl */ `
  varying vec3 vRest;
  uniform vec3 uSkin; uniform vec3 uJacket; uniform vec3 uShirt; uniform vec3 uTrousers;
  uniform vec3 uShoes; uniform vec3 uTie; uniform float uHasTie;
  uniform float uWaist; uniform float uNeck; uniform float uWrist;
`;

const CLOTHES_PAINT = /* glsl */ `
  {
    float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.21;
    float ax = abs(vRest.x);
    float y = vRest.y;
    vec3 cloth = uJacket;
    bool skin = false;
    if (y < 0.13) cloth = uShoes;
    else if (y < uWaist) cloth = uTrousers;
    else if (ax > uWrist || y > uNeck) skin = true;
    else {
      float vTop = uNeck - 0.03;
      bool front = vRest.z > 0.02;
      if (y > vTop - 0.05) cloth = uShirt;
      else if (front && ax < (y - (uNeck - 0.34)) * 0.42) {
        cloth = (uHasTie > 0.5 && ax < 0.022 + (vTop - y) * 0.04) ? uTie : uShirt;
      }
    }
    diffuseColor.rgb = skin ? uSkin * clamp(lum, 0.6, 1.3) : cloth * mix(1.0, lum, 0.25);
  }
`;

interface Template {
  kind: BodyKind;
  body: Object3D;
  boneNames: Set<string>;
}

interface Outfit {
  body: BodyKind;
  hair: string[];
  skin: string;
  hairColor: string;
  jacket: string;
  shirt: string;
  trousers: string;
  tie: string | null;
}

function outfitFor(call: OfficeVisitorCall, snap: OfficeSnapshot): Outfit {
  const r = seeded(call.mailId);
  const look = ROLES[call.role] ?? ROLES.reporter;
  const body: BodyKind = r() < 0.6 ? 'm' : 'f';
  const hair: string[] = [pick(r, BODIES[body].hair)];
  if (body === 'm' && r() < 0.35) hair.push('hair_beard');
  const club = (c: string): string => (c === 'club' ? snap.primary : c === 'club2' ? snap.secondary : c);
  return {
    body,
    hair,
    skin: pick(r, V.skinTones),
    hairColor: pick(r, V.hairColors),
    jacket: club(pick(r, look.jackets)),
    shirt: club(look.shirt),
    trousers: club(look.trousers),
    tie: pick(r, look.ties),
  };
}

type Phase = 'enter' | 'stand' | 'leave' | 'gone';

class Visitor {
  readonly root = new Group();
  readonly hit: Mesh;
  phase: Phase = 'enter';
  private readonly mixer: AnimationMixer;
  private readonly walk: AnimationAction;
  private readonly idle: AnimationAction;
  private readonly materials: Material[] = [];
  private path: [number, number][] = PATH_IN;
  private leg = 1;
  private heading = Math.PI;

  constructor(
    readonly call: OfficeVisitorCall,
    template: Template,
    hairTemplates: Map<string, SkinnedMesh[]>,
    clips: Map<string, AnimationClip>,
    outfit: Outfit,
    hitGeo: BoxGeometry,
    castShadow: boolean,
  ) {
    const body = cloneSkinned(template.body);
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    this.root.add(body);
    this.root.name = `visitor-${call.role}`;
    const dims = BODIES[outfit.body];

    const bones = new Map<string, Bone>();
    body.traverse((o) => {
      if ((o as Bone).isBone) bones.set(o.name, o as Bone);
      const m = o as SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
      m.castShadow = castShadow;
      const src = m.material as MeshStandardMaterial;
      if (/eye/i.test(m.name) && !/brow/i.test(m.name)) return;
      if (/brow/i.test(m.name)) {
        const mat = src.clone();
        mat.color = new Color(outfit.hairColor).multiplyScalar(1.6);
        m.material = mat;
        this.materials.push(mat);
        return;
      }
      m.material = this.clothes(src, outfit, dims);
    });

    // Hair is skinned to its own copy of the skeleton in the file; rebind it
    // to this body's bones by name.
    for (const id of outfit.hair) {
      for (const h of hairTemplates.get(id) ?? []) {
        const hair = h.clone() as SkinnedMesh;
        const list = h.skeleton.bones.map((b) => bones.get(b.name) ?? b);
        hair.bind(new Skeleton(list, h.skeleton.boneInverses), h.bindMatrix);
        const mat = (h.material as MeshStandardMaterial).clone();
        mat.color = new Color(outfit.hairColor).multiplyScalar(1.6);
        hair.material = mat;
        this.materials.push(mat);
        hair.frustumCulled = false;
        hair.castShadow = castShadow;
        body.add(hair);
      }
    }

    this.hit = new Mesh(hitGeo);
    this.hit.visible = false;
    this.hit.position.y = 0.9;
    this.hit.userData.mailId = call.mailId;
    this.root.add(this.hit);

    this.mixer = new AnimationMixer(body);
    const look = ROLES[call.role] ?? ROLES.reporter;
    const walkClip = clips.get(look.walk) ?? clips.get('Walk_Loop');
    const idleClip = clips.get('Idle_Talking_Loop') ?? clips.get('Idle_Loop');
    if (!walkClip || !idleClip) throw new Error('visitor animations missing');
    this.walk = this.mixer.clipAction(walkClip).setLoop(LoopRepeat, Infinity);
    this.idle = this.mixer.clipAction(idleClip).setLoop(LoopRepeat, Infinity);
    this.walk.play();

    const [x, z] = PATH_IN[0];
    this.root.position.set(x, 0, z);
    this.root.rotation.y = this.heading;
  }

  private clothes(src: MeshStandardMaterial, o: Outfit, dims: (typeof BODIES)[BodyKind]): MeshStandardMaterial {
    const mat = src.clone();
    mat.roughness = Math.max(mat.roughness, 0.7);
    mat.metalness = 0;
    const u = {
      uSkin: { value: new Color(o.skin) },
      uJacket: { value: new Color(o.jacket) },
      uShirt: { value: new Color(o.shirt) },
      uTrousers: { value: new Color(o.trousers) },
      uShoes: { value: new Color(V.shoes) },
      uTie: { value: new Color(o.tie ?? '#000000') },
      uHasTie: { value: o.tie ? 1 : 0 },
      uWaist: { value: dims.waist },
      uNeck: { value: dims.neck },
      uWrist: { value: dims.wrist },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${CLOTHES_VERT}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CLOTHES_FRAG}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${CLOTHES_PAINT}`);
    };
    mat.customProgramCacheKey = () => 'office-visitor-clothes';
    this.materials.push(mat);
    return mat;
  }

  leave(): void {
    if (this.phase === 'leave' || this.phase === 'gone') return;
    this.phase = 'leave';
    this.path = [...PATH_IN].reverse();
    this.leg = 1;
    this.idle.fadeOut(0.3);
    this.walk.reset().fadeIn(0.3).play();
  }

  /** Moves along the path; returns the distance to the door. */
  step(dt: number, camera: Vector3): number {
    this.mixer.update(dt);
    const p = this.root.position;
    let target = this.heading;
    if (this.phase === 'enter' || this.phase === 'leave') {
      let move = V.walkSpeed * dt;
      while (move > 0 && this.leg < this.path.length) {
        const [tx, tz] = this.path[this.leg];
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-4) target = Math.atan2(dx, dz);
        if (d <= move) {
          p.set(tx, 0, tz);
          move -= d;
          this.leg++;
        } else {
          p.x += (dx / d) * move;
          p.z += (dz / d) * move;
          move = 0;
        }
      }
      if (this.leg >= this.path.length) {
        if (this.phase === 'enter') {
          this.phase = 'stand';
          this.walk.fadeOut(0.35);
          this.idle.reset().fadeIn(0.35).play();
        } else {
          this.phase = 'gone';
        }
      }
    }
    if (this.phase === 'stand') target = Math.atan2(camera.x - p.x, camera.z - p.z);
    let diff = target - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += diff * Math.min(1, V.turnSpeed * dt);
    this.root.rotation.y = this.heading;
    return Math.hypot(p.x - DOOR_POINT.x, p.z - DOOR_POINT.z);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}

export interface VisitorLabel {
  mailId: string;
  text: string;
  anchor: Vector3;
}

export class Visitors {
  readonly root = new Group();
  private templates: Promise<{
    bodies: Map<BodyKind, Template>;
    hair: Map<string, SkinnedMesh[]>;
    clips: Map<string, AnimationClip>;
  }> | null = null;
  private current: Visitor | null = null;
  private wanted: { call: OfficeVisitorCall; snap: OfficeSnapshot } | null = null;
  private loadingId = '';
  private readonly hitGeo = new BoxGeometry(0.6, 1.8, 0.45);
  private doorAngle = 0;
  private disposed = false;

  constructor(
    private readonly assets: Assets,
    private readonly door: Object3D,
    private readonly castShadow: boolean,
    private readonly onReady: () => void,
  ) {
    this.root.name = 'visitors';
  }

  private load() {
    this.templates ??= Promise.all([
      this.assets.model('assets/office/people.glb'),
      this.assets.model('assets/office/anims.glb'),
    ]).then(([people, anims]) => {
      people.scene.updateMatrixWorld(true);
      const bodies = new Map<BodyKind, Template>();
      for (const kind of Object.keys(BODIES) as BodyKind[]) {
        const node = people.scene.getObjectByName(BODIES[kind].node);
        if (!node) throw new Error(`people.glb is missing ${BODIES[kind].node}`);
        const boneNames = new Set<string>();
        const inv = new Matrix4().copy(node.matrixWorld).invert();
        node.traverse((o) => {
          if ((o as Bone).isBone) boneNames.add(o.name);
          const m = o as SkinnedMesh;
          if (m.isSkinnedMesh && !m.geometry.getAttribute('aRest')) addRest(m, inv);
        });
        bodies.set(kind, { kind, body: node, boneNames });
      }
      const hair = new Map<string, SkinnedMesh[]>();
      for (const id of ['hair_buzzed', 'hair_simpleparted', 'hair_long', 'hair_buns', 'hair_beard']) {
        const list: SkinnedMesh[] = [];
        people.scene.getObjectByName(id)?.traverse((o) => {
          if ((o as SkinnedMesh).isSkinnedMesh) list.push(o as SkinnedMesh);
        });
        hair.set(id, list);
      }
      const bones = bodies.get('m')?.boneNames ?? new Set<string>();
      const clips = new Map<string, AnimationClip>();
      for (const clip of anims.animations) {
        const tracks = clip.tracks.filter((t) => {
          const [node, prop] = splitTrack(t.name);
          if (!bones.has(node)) return false;
          return prop === 'quaternion' || (prop === 'position' && /pelvis/i.test(node));
        });
        clips.set(clip.name, new AnimationClip(clip.name, clip.duration, tracks));
      }
      return { bodies, hair, clips };
    });
    return this.templates;
  }

  /** Shows who is visiting now. A different visitor first sends the current one out. */
  set(call: OfficeVisitorCall | null, snap: OfficeSnapshot): void {
    if (call && this.current && this.current.call.mailId === call.mailId && this.current.phase !== 'leave') return;
    this.wanted = call ? { call, snap } : null;
    if (this.current && this.current.phase !== 'gone') {
      if (!call || this.current.call.mailId !== call.mailId) this.current.leave();
      this.onReady();
      return;
    }
    this.spawn();
  }

  private spawn(): void {
    const want = this.wanted;
    if (!want || this.current || this.loadingId === want.call.mailId) return;
    this.loadingId = want.call.mailId;
    this.load()
      .then((t) => {
        this.loadingId = '';
        if (this.disposed || this.current || this.wanted?.call.mailId !== want.call.mailId) return;
        const outfit = outfitFor(want.call, want.snap);
        const template = t.bodies.get(outfit.body);
        if (!template) return;
        this.current = new Visitor(want.call, template, t.hair, t.clips, outfit, this.hitGeo, this.castShadow);
        this.root.add(this.current.root);
        this.onReady();
      })
      .catch((err: unknown) => {
        this.loadingId = '';
        console.warn('office: visitors unavailable', err);
      });
  }

  /** Advances walking and the door. Returns true while anything is moving. */
  update(dt: number, camera: Vector3): boolean {
    let moving = false;
    let doorTarget = 0;
    const v = this.current;
    if (v) {
      const doorDist = v.step(dt, camera);
      moving = true;
      if (v.phase !== 'stand' && doorDist < 1.7) doorTarget = DOOR_OPEN;
      if (v.phase === 'gone') {
        v.dispose();
        this.current = null;
        this.spawn();
      }
    }
    const d = doorTarget - this.doorAngle;
    if (Math.abs(d) > 1e-3) {
      this.doorAngle += d * Math.min(1, dt * 4);
      this.door.rotation.y = this.doorAngle;
      moving = true;
    }
    return moving;
  }

  hits(): Object3D[] {
    return this.current && this.current.phase !== 'leave' ? [this.current.hit] : [];
  }

  label(): VisitorLabel | null {
    const v = this.current;
    if (!v || v.phase !== 'stand') return null;
    const look = ROLES[v.call.role] ?? ROLES.reporter;
    return { mailId: v.call.mailId, text: `${look.label}: ${v.call.title}`, anchor: v.root.position.clone().setY(2.05) };
  }

  dispose(): void {
    this.disposed = true;
    this.current?.dispose();
    this.current = null;
    this.hitGeo.dispose();
  }
}

function splitTrack(name: string): [string, string] {
  const i = name.lastIndexOf('.');
  return [name.slice(0, i), name.slice(i + 1)];
}

/** Stores each vertex's rest-pose position (body space, metres) for the clothes shader. */
function addRest(mesh: SkinnedMesh, bodyInverse: Matrix4): void {
  const pos = mesh.geometry.getAttribute('position');
  const out = new Float32Array(pos.count * 3);
  const v = new Vector3();
  const toBody = new Matrix4().multiplyMatrices(bodyInverse, mesh.matrixWorld);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, v);
    v.applyMatrix4(toBody);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  mesh.geometry.setAttribute('aRest', new Float32BufferAttribute(out, 3));
}
