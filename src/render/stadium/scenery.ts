/**
 * What sits around the ground: a sky gradient and a seeded ring of houses and
 * trees. Shared by the Stadium tab and the match-day view.
 */
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';

export function skyTexture(top: string, horizon: string): CanvasTexture {
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
export function buildSurroundings(blocks: number, shadows: boolean): { root: Group; dispose(): void } {
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
