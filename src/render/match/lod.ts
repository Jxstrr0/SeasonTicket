/**
 * Lighter bodies for players far from the camera (Stage 5.6). A light body keeps every
 * vertex, so the skin weights and the kit painting are untouched, and only drops triangles:
 * it is the same geometry with a shorter index. They are made once per match view with
 * meshoptimizer's simplifier (MIT), which loads with the 3D match and nowhere else.
 */
import { BufferAttribute, BufferGeometry } from 'three';

/**
 * A light version of each geometry, about `ratio` of its triangles, never straying more than
 * `error` (a share of the mesh's size) from the full shape. Empty if the simplifier can't run.
 */
export async function lightGeometries(geos: readonly BufferGeometry[], ratio: number, error: number): Promise<Map<BufferGeometry, BufferGeometry>> {
  const out = new Map<BufferGeometry, BufferGeometry>();
  const { MeshoptSimplifier: M } = await import('meshoptimizer/simplifier');
  if (!M.supported) return out;
  await M.ready;
  for (const g of geos) {
    if (out.has(g)) continue;
    const pos = g.getAttribute('position');
    const n = pos.count;
    // The positions may be packed (quantized) in the file: read them back as plain floats.
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.getX(i);
      p[i * 3 + 1] = pos.getY(i);
      p[i * 3 + 2] = pos.getZ(i);
    }
    const index = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    const target = Math.max(3, Math.floor((index.length * ratio) / 3) * 3);
    const nor = g.getAttribute('normal');
    let light: Uint32Array;
    if (nor) {
      // Normals as attributes keep the shading where the shape folds.
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        a[i * 3] = nor.getX(i);
        a[i * 3 + 1] = nor.getY(i);
        a[i * 3 + 2] = nor.getZ(i);
      }
      [light] = M.simplifyWithAttributes(index, p, 3, a, 3, [0.5, 0.5, 0.5], null, target, error);
    } else [light] = M.simplify(index, p, 3, target, error);
    if (light.length < 3 || light.length >= index.length) continue;
    const lod = new BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) lod.setAttribute(name, attr);
    lod.setIndex(new BufferAttribute(n < 65536 ? Uint16Array.from(light) : light, 1));
    if (g.boundingSphere) lod.boundingSphere = g.boundingSphere.clone();
    if (g.boundingBox) lod.boundingBox = g.boundingBox.clone();
    out.set(g, lod);
  }
  return out;
}
