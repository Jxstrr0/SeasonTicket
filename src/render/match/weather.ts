/**
 * Weather on the 3D match (Stage 5.5): rain, snow or wind-blown dust falling through a box
 * of air kept in front of the camera, and the four corner flags, which wave harder in the
 * wind. The particles move entirely on the GPU (one draw call), so their count only costs
 * fill rate; each tier sets its own count.
 *
 * Heat has no particles: it is a warmer, hazier sky, fog and sun (weatherLook), with no
 * shimmer effect.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LineSegments,
  Matrix4,
  MeshLambertMaterial,
  NormalBlending,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import tuning from '../../data/tuning/atmosphere.json';
import type { QualityTier } from '../quality';
import { GRASS_Y } from '../stadium/model';
import type { MatchWeather } from './types';

const W = tuning.weather;
const HALF_X = 52.5;
const HALF_Z = 34;
/** The way the wind blows (a unit vector across the ground): mostly along the pitch. */
const WIND = new Vector3(0.94, 0, 0.34).normalize();

/** How the sky, fog and light change for a weather, over the clear-day look. */
export interface WeatherLook {
  sky?: [string, string];
  fog?: [string, number, number];
  sun?: number;
  sunColour?: string;
  skyLight?: number;
}

export function weatherLook(kind: MatchWeather): WeatherLook | null {
  if (kind === 'clear') return null;
  const w = W[kind] as WeatherLook & { sky: [string, string] };
  return { sky: w.sky, fog: w.fog, sun: w.sun, sunColour: w.sunColour, skyLight: w.skyLight };
}

export interface WeatherView {
  root: Group;
  /** Advances the weather; true while it moves (keep drawing). */
  tick(dt: number, camera: PerspectiveCamera, bufferHeight: number): boolean;
  dispose(): void;
}

const FALL_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uCentre;
uniform vec3 uVel;
uniform float uLen;
uniform float uSize;
uniform float uScale;
uniform float uDrift;
uniform float uFloor;
attribute vec3 aSeed;
attribute float aEnd;
varying float vAlpha;
void main() {
  vec3 lo = uCentre - 0.5 * uBox;
  vec3 p = aSeed * uBox + uVel * uTime * (0.8 + 0.4 * aSeed.y);
  p.x += sin(uTime * 1.3 + aSeed.z * 40.0) * uDrift;
  p.z += cos(uTime * 1.1 + aSeed.x * 40.0) * uDrift;
  p = lo + mod(p - lo, uBox);
  p -= normalize(uVel) * uLen * aEnd;
  // Fade out towards the edges of the box, and below the grass.
  vec3 q = abs(p - uCentre) / uBox;
  vAlpha = (1.0 - smoothstep(0.35, 0.5, max(q.x, max(q.y, q.z)))) * step(uFloor, p.y) * (1.0 - 0.75 * aEnd);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uScale / max(1.0, -mv.z), 1.0, 28.0);
}`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uColour;
uniform float uOpacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColour, uOpacity * vAlpha);
}`;

const POINT_FRAG = /* glsl */ `
uniform vec3 uColour;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColour, uOpacity * vAlpha * smoothstep(0.5, 0.15, d));
}`;

interface Fall {
  count: number;
  speed: number;
  opacity: number;
  colour: string;
  length?: number;
  size?: number;
  drift?: number;
}

/** The rain (streaks), snow or dust (soft dots) for a weather, or null for none. */
function buildFall(kind: MatchWeather, tier: QualityTier): { obj: LineSegments | Points; mat: ShaderMaterial } | null {
  if (kind !== 'rain' && kind !== 'snow' && kind !== 'wind') return null;
  const w = W[kind] as unknown as Omit<Fall, 'count'> & { count: Record<QualityTier, number> };
  const f: Fall = { ...w, count: w.count[tier] };
  const lines = kind === 'rain';
  const per = lines ? 2 : 1;
  const seeds = new Float32Array(f.count * per * 3);
  const ends = new Float32Array(f.count * per);
  // A fixed sequence, so the weather looks the same every time (and never touches the match).
  let r = 0x9e3779b9;
  const rnd = (): number => {
    r ^= r << 13;
    r ^= r >>> 17;
    r ^= r << 5;
    return (r >>> 0) / 0x1_0000_0000;
  };
  for (let i = 0; i < f.count; i++) {
    const s = [rnd(), rnd(), rnd()];
    for (let k = 0; k < per; k++) {
      seeds.set(s, (i * per + k) * 3);
      ends[i * per + k] = k;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(f.count * per * 3), 3));
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 3));
  geo.setAttribute('aEnd', new BufferAttribute(ends, 1));
  const slant = W.slant[kind];
  const vel = new Vector3(WIND.x * slant * f.speed, -f.speed, WIND.z * slant * f.speed);
  // Dust blows along the ground rather than falling.
  if (kind === 'wind') vel.set(WIND.x * f.speed, -0.35, WIND.z * f.speed);
  const mat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBox: { value: new Vector3(...(W.box as [number, number, number])) },
      uCentre: { value: new Vector3() },
      uVel: { value: vel },
      uLen: { value: lines ? (f.length ?? 0.7) : 0 },
      uSize: { value: f.size ?? 0.1 },
      uScale: { value: 1 },
      uDrift: { value: f.drift ?? 0 },
      uFloor: { value: GRASS_Y },
      uColour: { value: new Color(f.colour) },
      uOpacity: { value: f.opacity },
    },
    vertexShader: FALL_VERT,
    fragmentShader: lines ? LINE_FRAG : POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: kind === 'snow' ? NormalBlending : lines ? AdditiveBlending : NormalBlending,
  });
  const obj = lines ? new LineSegments(geo, mat) : new Points(geo, mat);
  obj.frustumCulled = false;
  obj.renderOrder = 3;
  return { obj, mat };
}

/** The four corner flags on their poles; the flags wave from a vertex shader. */
function buildFlags(strength: number): { root: Group; time: { value: number }; dispose(): void } {
  const F = W.flags;
  const root = new Group();
  const poleGeo = new CylinderGeometry(0.02, 0.025, F.height, 6);
  poleGeo.translate(0, F.height / 2, 0);
  const poleMat = new MeshLambertMaterial({ color: '#f2f2f2' });
  const poles = new InstancedMesh(poleGeo, poleMat, 4);
  const [fw, fh] = F.size as [number, number];
  const flagGeo = new PlaneGeometry(fw, fh, 6, 1);
  // Hung from the pole's top, flying away from it along +x.
  flagGeo.translate(fw / 2, F.height - fh / 2, 0);
  const flagMat = new MeshLambertMaterial({ color: '#f1c92b', side: DoubleSide });
  const time = { value: 0 };
  const amp = { value: strength };
  flagMat.onBeforeCompile = (shader) => {
    shader.uniforms.flagTime = time;
    shader.uniforms.flagAmp = amp;
    shader.vertexShader = `uniform float flagTime;\nuniform float flagAmp;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
	float flagU = clamp(position.x / ${fw.toFixed(3)}, 0.0, 1.0);
	float flagPh = 0.0;
#ifdef USE_INSTANCING
	flagPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
#endif
	transformed.z += sin(flagU * 5.0 - flagTime * (3.0 + 5.0 * flagAmp) + flagPh) * flagU * (0.03 + 0.07 * flagAmp);
	// A calm flag droops against the pole.
	transformed.y -= (1.0 - flagAmp) * flagU * flagU * 0.18;
	transformed.x *= 0.55 + 0.45 * flagAmp;`,
    )}`;
  };
  flagMat.customProgramCacheKey = () => 'corner-flag';
  const flags = new InstancedMesh(flagGeo, flagMat, 4);
  const m = new Matrix4();
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.atan2(WIND.z, WIND.x));
  const p = new Vector3();
  const one = new Vector3(1, 1, 1);
  let i = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.set(sx * HALF_X, GRASS_Y, sz * HALF_Z);
      poles.setMatrixAt(i, m.compose(p, new Quaternion(), one));
      flags.setMatrixAt(i, m.compose(p, q, one));
      i++;
    }
  }
  for (const mesh of [poles, flags]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  return {
    root,
    time,
    dispose() {
      poleGeo.dispose();
      poleMat.dispose();
      flagGeo.dispose();
      flagMat.dispose();
      poles.dispose();
      flags.dispose();
    },
  };
}

export function buildWeather(kind: MatchWeather, tier: QualityTier): WeatherView {
  const root = new Group();
  root.name = 'weather';
  const fall = buildFall(kind, tier);
  if (fall) root.add(fall.obj);
  const flags = buildFlags(kind === 'wind' ? W.flags.windy : kind === 'rain' ? (W.flags.calm + W.flags.windy) / 2 : W.flags.calm);
  root.add(flags.root);
  const fwd = new Vector3();
  const box = W.box as [number, number, number];
  let flagWait = 0;
  return {
    root,
    tick(dt, camera, bufferHeight) {
      flags.time.value += dt;
      if (!fall) {
        // Only the corner flags move: a few redraws a second is enough while the match is
        // paused, and saves a phone drawing the whole ground 30 times a second for them.
        flagWait += dt;
        if (flagWait < 1 / 8) return false;
        flagWait = 0;
        return true;
      }
      const u = fall.mat.uniforms;
      // Wrapped now and then so the shader's sums keep their precision on a long night.
      u.uTime.value = (u.uTime.value + dt) % 3600;
      // The box sits in front of the camera, so the air it looks through is full.
      camera.getWorldDirection(fwd);
      u.uCentre.value.copy(camera.position).addScaledVector(fwd, box[2] * 0.45);
      u.uScale.value = bufferHeight / (2 * Math.tan((camera.getEffectiveFOV() * Math.PI) / 360));
      return true;
    },
    dispose() {
      if (fall) {
        fall.obj.geometry.dispose();
        fall.mat.dispose();
      }
      flags.dispose();
    },
  };
}
