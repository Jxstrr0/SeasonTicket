/**
 * The trophy cabinet: a gold cup for each playoff title, a silver cup for
 * each final lost, and a shield for each league-table win. Newest go on the
 * top shelf first.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
} from 'three';
import type { OfficeTrophy } from './types';

export interface Shelf {
  x: number;
  z: number;
  levels: number[];
  slots: number[];
  maxHeight: number;
}

const CUP_PROFILE: [number, number][] = [
  [0, 0],
  [0.055, 0],
  [0.055, 0.025],
  [0.035, 0.035],
  [0.014, 0.05],
  [0.012, 0.12],
  [0.02, 0.135],
  [0.05, 0.165],
  [0.068, 0.22],
  [0.072, 0.27],
  [0.066, 0.272],
  [0.06, 0.225],
  [0.0, 0.2],
];

export class TrophyCase {
  readonly root = new Group();
  private readonly geoms: BufferGeometry[] = [];
  private readonly gold = new MeshStandardMaterial({ color: '#d4af37', metalness: 1, roughness: 0.25 });
  private readonly silver = new MeshStandardMaterial({ color: '#c0c4c8', metalness: 1, roughness: 0.28 });
  private readonly woodBase = new MeshStandardMaterial({ color: '#2e1f15', metalness: 0, roughness: 0.5 });
  private readonly cup: BufferGeometry;
  private readonly handle: BufferGeometry;
  private readonly disc: BufferGeometry;
  private readonly plinth: BufferGeometry;
  private key = '';

  constructor(
    private readonly shelf: Shelf,
    detail: number,
  ) {
    const seg = [24, 40, 64][Math.max(0, Math.min(2, detail))];
    this.cup = this.keep(new LatheGeometry(CUP_PROFILE.map(([x, y]) => new Vector2(x, y)), seg));
    this.handle = this.keep(new TorusGeometry(0.035, 0.006, 8, Math.round(seg / 2), Math.PI));
    this.disc = this.keep(new CylinderGeometry(0.1, 0.1, 0.014, seg));
    this.plinth = this.keep(new BoxGeometry(0.12, 0.04, 0.08));
    this.root.name = 'trophies';
  }

  private keep<T extends BufferGeometry>(g: T): T {
    this.geoms.push(g);
    return g;
  }

  private cupMesh(silver: boolean): Group {
    const g = new Group();
    const mat = silver ? this.silver : this.gold;
    const body = new Mesh(this.cup, mat);
    g.add(body);
    for (const side of [-1, 1]) {
      const h = new Mesh(this.handle, mat);
      h.position.set(0, 0.215, side * 0.068);
      h.rotation.set(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, -Math.PI / 2);
      g.add(h);
    }
    if (silver) g.scale.setScalar(0.85);
    return g;
  }

  private shieldMesh(): Group {
    const g = new Group();
    const base = new Mesh(this.plinth, this.woodBase);
    base.position.y = 0.02;
    g.add(base);
    const disc = new Mesh(this.disc, this.silver);
    disc.rotation.z = Math.PI / 2;
    disc.position.y = 0.04 + 0.1;
    g.add(disc);
    return g;
  }

  /** Rebuilds the shelf when the trophy list changes. */
  set(trophies: OfficeTrophy[]): void {
    const key = trophies.map((t) => `${t.kind}${t.season}`).join(',');
    if (key === this.key) return;
    this.key = key;
    this.root.clear();
    const { x, z, levels, slots } = this.shelf;
    const newest = [...trophies].sort((a, b) => b.season - a.season || a.kind.localeCompare(b.kind));
    newest.slice(0, levels.length * slots.length).forEach((t, i) => {
      const level = levels[Math.floor(i / slots.length)];
      const slot = slots[i % slots.length];
      const o = t.kind === 'shield' ? this.shieldMesh() : this.cupMesh(t.kind === 'runnerUp');
      o.position.set(x, level, z + slot);
      o.traverse((c) => {
        if ((c as Mesh).isMesh) c.castShadow = true;
      });
      this.root.add(o);
    });
  }

  dispose(): void {
    this.root.clear();
    for (const g of this.geoms) g.dispose();
    this.gold.dispose();
    this.silver.dispose();
    this.woodBase.dispose();
  }
}
