/**
 * The tactics overlay (Stage 5.4): a team's shape painted on the grass. Each line of the
 * formation (the back line, the midfield, the front) is joined player to player, left to
 * right as they stand, with a coloured ribbon over a wider dark one so it reads on any
 * grass and any kit. The back line also runs the width of the pitch at its players' mean
 * depth, and a dashed line marks the depth the team is aiming its line for. A white ring
 * marks the player the owner tapped.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import tuning from '../../data/tuning/match3d.json';
import type { MatchFrame3D, ShapeOverlay3D } from './types';

const O = tuning.overlay;
const HALF_X = 52.5;
const HALF_Z = 34;
/** Ribbon pieces per layer: the lines of a formation, the back line and the dashes. */
const MAX_QUADS = 64;

/** Flat strips on the grass, rebuilt each frame into one buffer. */
class Strips {
  readonly mesh: Mesh;
  private readonly geo = new BufferGeometry();
  private readonly pos = new Float32Array(MAX_QUADS * 4 * 3);
  private readonly attr: BufferAttribute;
  private n = 0;

  constructor(
    readonly material: MeshBasicMaterial,
    private readonly y: number,
    order: number,
  ) {
    this.attr = new BufferAttribute(this.pos, 3);
    this.geo.setAttribute('position', this.attr);
    const index = new Uint16Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6);
    this.geo.setIndex(new BufferAttribute(index, 1));
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }

  begin(): void {
    this.n = 0;
  }

  /** A strip w wide from (x0, z0) to (x1, z1), stretched by half its width at both ends. */
  add(x0: number, z0: number, x1: number, z1: number, w: number): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3 || this.n >= MAX_QUADS) return;
    const h = w / 2;
    const ux = (dx / d) * h;
    const uz = (dz / d) * h;
    const p = this.pos;
    let o = this.n * 12;
    const put = (x: number, z: number): void => {
      p[o++] = x;
      p[o++] = this.y;
      p[o++] = z;
    };
    put(x0 - ux + uz, z0 - uz - ux);
    put(x0 - ux - uz, z0 - uz + ux);
    put(x1 + ux + uz, z1 + uz - ux);
    put(x1 + ux - uz, z1 + uz + ux);
    this.n += 1;
  }

  end(): void {
    this.geo.setDrawRange(0, this.n * 6);
    this.attr.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

const strip = (opacity: number, colour = '#ffffff'): MeshBasicMaterial =>
  new MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export class PitchMarks {
  readonly root = new Group();
  private readonly under = new Strips(strip(O.edgeOpacity, '#0b1020'), 0.05, 2);
  private readonly over = new Strips(strip(O.opacity), 0.06, 3);
  private readonly aim = new Strips(strip(O.aimOpacity), 0.06, 3);
  private readonly ring: Mesh;
  private shape: ShapeOverlay3D | null = null;
  private who = -1;
  private readonly order: number[] = [];

  constructor() {
    const geo = new RingGeometry(O.ring / 2 - 0.16, O.ring / 2, 40);
    geo.rotateX(-Math.PI / 2);
    this.ring = new Mesh(geo, strip(0.95));
    this.ring.renderOrder = 3;
    this.ring.visible = false;
    this.root.add(this.under.mesh, this.over.mesh, this.aim.mesh, this.ring);
  }

  set(shape: ShapeOverlay3D | null): void {
    this.shape = shape;
    if (shape) {
      this.over.material.color.set(shape.colour);
      this.aim.material.color.set(shape.colour);
    }
  }

  /** Rings the player with person code `who`, or nobody (-1). */
  select(who: number): void {
    this.who = who;
  }

  /** Lays the marks out under the players of frame `f`. */
  update(f: MatchFrame3D): void {
    this.under.begin();
    this.over.begin();
    this.aim.begin();
    const s = this.shape;
    if (s) {
      s.rows.forEach((row, k) => this.line(f, row, k === 0));
      if (s.aimX !== null) {
        const x = s.aimX - HALF_X;
        for (let z = -HALF_Z; z < HALF_Z; z += O.dash + O.gap) this.aim.add(x, z, x, Math.min(HALF_Z, z + O.dash), O.backWidth);
      }
    }
    this.under.end();
    this.over.end();
    this.aim.end();
    this.ring.visible = false;
    if (this.who < 0) return;
    for (let i = 0; i < 22; i++) {
      if (f.who[i] !== this.who || !f.on[i]) continue;
      this.ring.position.set(f.px[i] - HALF_X, 0.07, f.py[i] - HALF_Z);
      this.ring.visible = true;
    }
  }

  /** One line of the formation, joined left to right; the back line also runs the pitch's width. */
  private line(f: MatchFrame3D, row: readonly number[], back: boolean): void {
    const o = this.order;
    o.length = 0;
    for (const i of row) if (f.on[i]) o.push(i);
    if (!o.length) return;
    o.sort((a, b) => f.py[a] - f.py[b]);
    if (back) {
      let x = 0;
      for (const i of o) x += f.px[i];
      x = x / o.length - HALF_X;
      this.under.add(x, -HALF_Z, x, HALF_Z, O.backWidth + O.edge - O.width);
      this.over.add(x, -HALF_Z, x, HALF_Z, O.backWidth);
    }
    for (let k = 1; k < o.length; k++) {
      const a = o[k - 1];
      const b = o[k];
      const x0 = f.px[a] - HALF_X;
      const z0 = f.py[a] - HALF_Z;
      const x1 = f.px[b] - HALF_X;
      const z1 = f.py[b] - HALF_Z;
      this.under.add(x0, z0, x1, z1, O.edge);
      this.over.add(x0, z0, x1, z1, O.width);
    }
  }

  dispose(): void {
    this.under.dispose();
    this.over.dispose();
    this.aim.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
  }
}
