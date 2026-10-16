/**
 * The view from the window: a dusk sky, the city, and the club's stadium
 * with its floodlights on. The office is high in a tower, so the stadium is
 * seen from above, from a corner, with the Main Stand on the near side.
 *
 * The stadium is the same model as the Stadium tab's, so every upgrade the
 * owner buys shows up here too.
 */
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three';
import officeTuning from '../../data/tuning/office.json';
import type { TierSettings } from '../quality';
import { buildStadiumModel } from '../stadium/model';
import { ScreenTexture, paintCityWindows } from './screens';
import type { OfficeSnapshot } from './types';

const WINDOW = officeTuning.window;
/** Height of the street below the office floor. */
const GROUND = -WINDOW.towerHeight;
/** Stadium centre, in world space: out through the window, a little to the left. */
const STADIUM = new Vector3(-0.8776, 0, -0.4795).multiplyScalar(WINDOW.stadiumDistance).setY(GROUND);

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

export function buildOutside(tier: TierSettings, camera: Vector3, onDirty?: () => void): Outside {
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

  // The stadium model has its pitch along x and the Main Stand on +z. Turn it
  // so the office looks in over a corner, with the Main Stand on the far side.
  const stadium = buildStadiumModel(tier, {
    crowdCap: Math.round(WINDOW.crowdCap * tier.crowdDensity),
    selfLit: WINDOW.selfLit,
    onDirty,
  });
  const toOffice = new Vector3(camera.x - STADIUM.x, 0, camera.z - STADIUM.z).normalize();
  stadium.root.position.copy(STADIUM);
  // Lifted a touch so its plaza never flickers against the street.
  stadium.root.position.y += 0.3;
  stadium.root.rotation.y = Math.atan2(-toOffice.z, toOffice.x) + (WINDOW.cornerAngle * Math.PI) / 180;
  root.add(stadium.root);

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
    if (Math.hypot(x - STADIUM.x, z - STADIUM.z) < 190) continue;
    // Keep the line of sight from the office to the stadium clear.
    const along = (x * STADIUM.x + z * STADIUM.z) / (STADIUM.x * STADIUM.x + STADIUM.z * STADIUM.z);
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

  let cityKey = '';
  return {
    root,
    update(snap) {
      if (cityKey !== snap.abbr) {
        cityKey = snap.abbr;
        paintCityWindows(winTex, hashRng(snap.abbr)() * 4294967296);
      }
      // The model dims its own glow when the club has fewer floodlights.
      stadium.update(snap.stadium);
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
      stadium.dispose();
      winTex.dispose();
      city.dispose();
    },
  };
}
