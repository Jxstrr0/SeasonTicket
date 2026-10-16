/**
 * The view from the window: a dusk sky, the city, and the club's stadium
 * with its floodlights on. The office is high in a tower, so the stadium is
 * seen from above, looking down the length of the pitch.
 *
 * This stadium is a simple placeholder; Stage 4's stadium builder replaces it.
 */
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from 'three';
import type { TierSettings } from '../quality';
import { ScreenTexture, paintCityWindows } from './screens';
import type { OfficeSnapshot } from './types';

/** Height of the street below the office floor. */
const GROUND = -38;
/** Stadium centre, in world space. */
const STADIUM = new Vector3(-205, GROUND, -112);
const PITCH = { length: 105, width: 68 };
const MAX_CROWD = 3000;

/** Small seeded hash, so the same club always gets the same skyline. */
function hashRng(text: string): () => number {
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

/**
 * A stand as a wedge: `len` along local x, rising from height `lip` at the
 * pitch edge (z = 0) to `h` at the back (z = depth). Faces point outward.
 */
function wedge(len: number, depth: number, lip: number, h: number): BufferGeometry {
  const a = -len / 2;
  const b = len / 2;
  // Corner points.
  const p = {
    f0: [a, 0, 0], f1: [b, 0, 0], l0: [a, lip, 0], l1: [b, lip, 0],
    t0: [a, h, depth], t1: [b, h, depth], g0: [a, 0, depth], g1: [b, 0, depth],
  };
  const tris: number[][] = [
    // front lip wall, facing -z (towards the pitch)
    p.f0, p.l0, p.l1, p.f0, p.l1, p.f1,
    // sloped seating
    p.l0, p.t0, p.t1, p.l0, p.t1, p.l1,
    // back wall, facing +z
    p.g0, p.g1, p.t1, p.g0, p.t1, p.t0,
    // end caps
    p.f0, p.g0, p.t0, p.f0, p.t0, p.l0,
    p.f1, p.l1, p.t1, p.f1, p.t1, p.g1,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}

function pitchTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 662;
  const ctx = c.getContext('2d');
  if (ctx) {
    const stripes = 14;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#3f8f3a' : '#4aa043';
      ctx.fillRect((i * c.width) / stripes, 0, c.width / stripes + 1, c.height);
    }
    const sx = c.width / PITCH.length;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
    ctx.beginPath();
    ctx.moveTo(c.width / 2, 0);
    ctx.lineTo(c.width / 2, c.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.width / 2, c.height / 2, 9.15 * sx, 0, Math.PI * 2);
    ctx.stroke();
    const boxD = 16.5 * sx;
    const boxW = 40.3 * sx;
    ctx.strokeRect(4, (c.height - boxW) / 2, boxD, boxW);
    ctx.strokeRect(c.width - 4 - boxD, (c.height - boxW) / 2, boxD, boxW);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new Color('#0b1430') },
      mid: { value: new Color('#3a3a6a') },
      horizon: { value: new Color('#f08a4f') },
      below: { value: new Color('#1b1a24') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 below;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        // Brighter towards the sunset, which sits behind the stadium.
        float sun = pow(max(dot(normalize(vec3(-0.85, 0.0, -0.5)), normalize(vec3(vDir.x, 0.0, vDir.z))), 0.0), 6.0);
        vec3 c = y > 0.0
          ? mix(mix(horizon, mid, smoothstep(0.0, 0.18, y)), top, smoothstep(0.18, 0.7, y))
          : mix(horizon * 0.55, below, smoothstep(0.0, 0.08, -y));
        c += horizon * sun * 0.35 * (1.0 - smoothstep(0.0, 0.3, abs(y)));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export interface Outside {
  root: Group;
  update(snap: OfficeSnapshot): void;
  dispose(): void;
}

export function buildOutside(tier: TierSettings, camera: Vector3): Outside {
  const root = new Group();
  root.name = 'outside';
  const geoms: BufferGeometry[] = [];
  const mats: Material[] = [];
  const keep = <T extends BufferGeometry>(g: T): T => (geoms.push(g), g);
  const mat = <T extends Material>(m: T): T => (mats.push(m), m);

  const sky = new Mesh(keep(new SphereGeometry(1500, 32, 16)), mat(skyMaterial()));
  sky.renderOrder = -1;
  root.add(sky);

  const ground = new Mesh(keep(new PlaneGeometry(4000, 4000)), mat(new MeshLambertMaterial({ color: '#1c1e24' })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND;
  root.add(ground);

  // Stadium: local +x points at the office, so we look down the pitch.
  const stadium = new Group();
  stadium.position.copy(STADIUM);
  const toOffice = new Vector3(camera.x - STADIUM.x, 0, camera.z - STADIUM.z).normalize();
  stadium.rotation.y = Math.atan2(-toOffice.z, toOffice.x);
  root.add(stadium);

  const pitchTex = pitchTexture();
  const grassMat = mat(new MeshLambertMaterial({ color: '#2f6b2c' }));
  const surround = new Mesh(keep(new PlaneGeometry(PITCH.length + 12, PITCH.width + 10)), grassMat);
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = 0.2;
  stadium.add(surround);
  const pitch = new Mesh(
    keep(new PlaneGeometry(PITCH.length, PITCH.width)),
    mat(new MeshBasicMaterial({ map: pitchTex, color: '#d8e8d0' })),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.6;
  stadium.add(pitch);

  const seatMat = mat(new MeshLambertMaterial({ color: '#333', side: DoubleSide }));
  const roofMat = mat(new MeshLambertMaterial({ color: '#888', side: DoubleSide }));
  const hx = PITCH.length / 2 + 5;
  const hz = PITCH.width / 2 + 5;
  // [centre x, centre z, facing (yaw to point the slope outward), length, depth, height, roof]
  const stands: { x: number; z: number; yaw: number; len: number; depth: number; h: number; roof: boolean }[] = [
    { x: hx, z: 0, yaw: Math.PI / 2, len: PITCH.width + 6, depth: 12, h: 5, roof: false }, // near end (low)
    { x: -hx, z: 0, yaw: -Math.PI / 2, len: PITCH.width + 6, depth: 26, h: 18, roof: true }, // far end
    { x: 0, z: hz, yaw: 0, len: PITCH.length + 6, depth: 24, h: 16, roof: true },
    { x: 0, z: -hz, yaw: Math.PI, len: PITCH.length + 6, depth: 24, h: 16, roof: true },
  ];
  for (const s of stands) {
    const g = new Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.yaw;
    g.add(new Mesh(keep(wedge(s.len, s.depth, 1.5, s.h)), seatMat));
    if (s.roof) {
      const roof = new Mesh(keep(new BoxGeometry(s.len, 0.6, s.depth * 0.75)), roofMat);
      roof.position.set(0, s.h + 4, s.depth * 0.62);
      roof.rotation.x = -0.06;
      g.add(roof);
    }
    stadium.add(g);
  }

  // Floodlight masts in the corners.
  const mastMat = mat(new MeshLambertMaterial({ color: '#5a5f66' }));
  const lampMat = mat(new MeshBasicMaterial({ color: '#fff6e0' }));
  const mastGeo = keep(new BoxGeometry(1.2, 44, 1.2));
  const headGeo = keep(new BoxGeometry(7, 3.5, 1.2));
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const m = new Mesh(mastGeo, mastMat);
    m.position.set(sx * (hx + 14), 22, sz * (hz + 14));
    stadium.add(m);
    const head = new Mesh(headGeo, lampMat);
    head.position.set(sx * (hx + 14), 44, sz * (hz + 14));
    head.lookAt(STADIUM);
    stadium.add(head);
  }

  // The crowd: tiny upright cards on the seating slopes, coloured by club.
  const crowdGeo = keep(new PlaneGeometry(0.75, 1.1));
  crowdGeo.translate(0, 0.55, 0);
  const crowdMat = mat(new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide }));
  const crowd = new InstancedMesh(crowdGeo, crowdMat, MAX_CROWD);
  crowd.count = 0;
  crowd.frustumCulled = false;
  stadium.add(crowd);

  // City towers, on the far side of the window only.
  const rnd = hashRng('skyline');
  const winTex = new ScreenTexture(128, 256, 1);
  const cityMat = mat(
    new MeshLambertMaterial({ color: '#8a90a0', map: winTex.texture, emissive: '#ffffff', emissiveMap: winTex.texture, emissiveIntensity: 0.85 }),
  );
  const city = new InstancedMesh(keep(new BoxGeometry(1, 1, 1)), cityMat, tier.cityBlocks);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const tmp = new Vector3();
  const col = new Color();
  let placed = 0;
  for (let tries = 0; placed < tier.cityBlocks && tries < tier.cityBlocks * 40; tries++) {
    const ang = Math.PI + (rnd() - 0.5) * Math.PI * 0.9;
    const dist = 140 + rnd() * 900;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist - 40;
    if (Math.hypot(x - STADIUM.x, z - STADIUM.z) < 120) continue;
    // Keep the line of sight from the office to the stadium clear.
    const along = (x * STADIUM.x + z * STADIUM.z) / STADIUM.lengthSq();
    if (along > 0 && along < 1.1) {
      const off = Math.abs(x * STADIUM.z - z * STADIUM.x) / Math.hypot(STADIUM.x, STADIUM.z);
      if (off < 90) continue;
    }
    const w = 18 + rnd() * 30;
    const h = 20 + rnd() * 100;
    tmp.set(w, h, 18 + rnd() * 30);
    q.setFromAxisAngle(new Vector3(0, 1, 0), rnd() * Math.PI);
    m4.compose(new Vector3(x, GROUND + h / 2, z), q, tmp);
    city.setMatrixAt(placed, m4);
    const fade = 1 - Math.min(0.6, dist / 1600);
    city.setColorAt(placed, col.setScalar(fade));
    placed++;
  }
  city.count = placed;
  city.instanceMatrix.needsUpdate = true;
  if (city.instanceColor) city.instanceColor.needsUpdate = true;
  root.add(city);

  let crowdKey = '';
  let cityKey = '';
  return {
    root,
    update(snap) {
      seatMat.color.set(snap.primary).multiplyScalar(0.55);
      roofMat.color.set(snap.secondary).lerp(new Color('#8c9096'), 0.5);
      if (cityKey !== snap.abbr) {
        cityKey = snap.abbr;
        paintCityWindows(winTex, hashRng(snap.abbr)() * 4294967296);
      }
      const n = Math.round(MAX_CROWD * tier.crowdDensity * Math.max(0, Math.min(1, snap.attendance)));
      const key = `${n}${snap.primary}${snap.secondary}`;
      if (key === crowdKey) return;
      crowdKey = key;
      const r = hashRng(`${snap.abbr}crowd`);
      const palette = [new Color(snap.primary), new Color(snap.primary), new Color(snap.secondary), new Color('#d9d4c8'), new Color('#2a2c33')];
      const dummy = new Object3D();
      // Spread fans over the stands by seating area.
      const areas = stands.map((s) => s.len * s.depth);
      const total = areas.reduce((a, b) => a + b, 0);
      let i = 0;
      stands.forEach((s, si) => {
        const k = si === stands.length - 1 ? n - i : Math.round((n * areas[si]) / total);
        for (let j = 0; j < k && i < n; j++, i++) {
          const u = r();
          const lx = (r() - 0.5) * (s.len - 2);
          const lz = 1 + u * (s.depth - 2);
          const ly = 1.5 + (lz / s.depth) * (s.h - 1.5);
          dummy.position.set(lx, ly, lz);
          dummy.position.applyAxisAngle(new Vector3(0, 1, 0), s.yaw);
          dummy.position.x += s.x;
          dummy.position.z += s.z;
          dummy.rotation.set(0, s.yaw, 0);
          dummy.updateMatrix();
          crowd.setMatrixAt(i, dummy.matrix);
          crowd.setColorAt(i, col.copy(palette[Math.floor(r() * palette.length)]).multiplyScalar(0.6 + r() * 0.4));
        }
      });
      crowd.count = i;
      crowd.instanceMatrix.needsUpdate = true;
      if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
      pitchTex.dispose();
      winTex.dispose();
      crowd.dispose();
      city.dispose();
    },
  };
}
