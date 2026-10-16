/**
 * A small mesh builder: collects triangles for one material, then makes a
 * single BufferGeometry, so a whole stand is a handful of draw calls.
 */
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';

export type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uvs: number[] = [];
  private readonly col: number[] = [];

  get empty(): boolean {
    return this.pos.length === 0;
  }

  private vert(p: V3, n: V3, uv: [number, number], shade: number): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uvs.push(uv[0], uv[1]);
    this.col.push(shade, shade, shade);
  }

  /**
   * A triangle facing `n` (or per-vertex normals); the winding is flipped
   * if needed so the front face points the way the normal says.
   */
  tri(a: V3, b: V3, c: V3, n: V3 | [V3, V3, V3], uv: [[number, number], [number, number], [number, number]] = [[0, 0], [1, 0], [1, 1]], shade = 1): void {
    const ns: [V3, V3, V3] = Array.isArray(n[0]) ? (n as [V3, V3, V3]) : [n as V3, n as V3, n as V3];
    const want: V3 = [ns[0][0] + ns[1][0] + ns[2][0], ns[0][1] + ns[1][1] + ns[2][1], ns[0][2] + ns[1][2] + ns[2][2]];
    const face = cross(sub(b, a), sub(c, a));
    if (dot(face, want) < 0) {
      this.vert(a, ns[0], uv[0], shade);
      this.vert(c, ns[2], uv[2], shade);
      this.vert(b, ns[1], uv[1], shade);
    } else {
      this.vert(a, ns[0], uv[0], shade);
      this.vert(b, ns[1], uv[1], shade);
      this.vert(c, ns[2], uv[2], shade);
    }
  }

  /** A quad a-b-c-d (in order around its edge). */
  quad(
    a: V3,
    b: V3,
    c: V3,
    d: V3,
    n: V3 | [V3, V3, V3, V3],
    uv: [[number, number], [number, number], [number, number], [number, number]] = [[0, 0], [1, 0], [1, 1], [0, 1]],
    shade = 1,
  ): void {
    const ns: [V3, V3, V3, V3] = Array.isArray(n[0]) ? (n as [V3, V3, V3, V3]) : [n as V3, n as V3, n as V3, n as V3];
    this.tri(a, b, c, [ns[0], ns[1], ns[2]], [uv[0], uv[1], uv[2]], shade);
    this.tri(a, c, d, [ns[0], ns[2], ns[3]], [uv[0], uv[2], uv[3]], shade);
  }

  /** A square-section bar from a to b (trusses, masts, crane parts). */
  beam(a: V3, b: V3, w: number, h = w): void {
    const dir = norm(sub(b, a));
    const up: V3 = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const s = norm(cross(dir, up));
    const u = norm(cross(s, dir));
    const hw = w / 2;
    const hh = h / 2;
    const corner = (p: V3, i: number, j: number): V3 => [p[0] + s[0] * hw * i + u[0] * hh * j, p[1] + s[1] * hw * i + u[1] * hh * j, p[2] + s[2] * hw * i + u[2] * hh * j];
    const ring = (p: V3): V3[] => [corner(p, -1, -1), corner(p, 1, -1), corner(p, 1, 1), corner(p, -1, 1)];
    const ra = ring(a);
    const rb = ring(b);
    const faces: [number, number, V3][] = [
      [0, 1, [-u[0], -u[1], -u[2]]],
      [1, 2, s],
      [2, 3, u],
      [3, 0, [-s[0], -s[1], -s[2]]],
    ];
    for (const [i, j, n] of faces) this.quad(ra[i], ra[j], rb[j], rb[i], n);
    this.quad(ra[0], ra[1], ra[2], ra[3], [-dir[0], -dir[1], -dir[2]]);
    this.quad(rb[0], rb[1], rb[2], rb[3], dir);
  }

  /** An axis-aligned box (turned by `yaw` about its centre). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw = 0, shade = 1): void {
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const p = (x: number, y: number, z: number): V3 => [cx + x * c + z * sn, cy + y, cz - x * sn + z * c];
    const r = (x: number, y: number, z: number): V3 => [x * c + z * sn, y, -x * sn + z * c];
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const uvx: [[number, number], [number, number], [number, number], [number, number]] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.quad(p(hx, -hy, -hz), p(hx, -hy, hz), p(hx, hy, hz), p(hx, hy, -hz), r(1, 0, 0), uvx, shade);
    this.quad(p(-hx, -hy, hz), p(-hx, -hy, -hz), p(-hx, hy, -hz), p(-hx, hy, hz), r(-1, 0, 0), uvx, shade);
    this.quad(p(-hx, hy, -hz), p(hx, hy, -hz), p(hx, hy, hz), p(-hx, hy, hz), [0, 1, 0], uvx, shade);
    this.quad(p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, -hy, -hz), p(-hx, -hy, -hz), [0, -1, 0], uvx, shade);
    this.quad(p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, hy, hz), p(-hx, hy, hz), r(0, 0, 1), uvx, shade);
    this.quad(p(hx, -hy, -hz), p(-hx, -hy, -hz), p(-hx, hy, -hz), p(hx, hy, -hz), r(0, 0, -1), uvx, shade);
  }

  /**
   * A flat polygon (given as 2D points) placed in 3D by `place`, facing `n`.
   * Used for the end walls of stands, whose cross-sections are not convex.
   */
  polygon(points: { x: number; y: number }[], place: (x: number, y: number) => V3, n: V3, uv: (x: number, y: number) => [number, number]): void {
    const contour = points.map((p) => new Vector2(p.x, p.y));
    const tris = ShapeUtils.triangulateShape(contour, []);
    for (const [i, j, k] of tris) {
      const a = points[i];
      const b = points[j];
      const c = points[k];
      this.tri(place(a.x, a.y), place(b.x, b.y), place(c.x, c.y), n, [uv(a.x, a.y), uv(b.x, b.y), uv(c.x, c.y)]);
    }
  }

  build(): BufferGeometry | null {
    if (this.empty) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
