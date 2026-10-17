/**
 * Helpers for the Quaternius characters (CC0) shared by the office visitors and the
 * match-day players: every body and hair piece in people.glb is on the same 65-bone rig,
 * and the animation files carry clips for that rig.
 */
import { Float32BufferAttribute, Matrix4, PropertyBinding, Vector3, type SkinnedMesh } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Every body and hair piece in people.glb carries its own copy of the same
 * skeleton, so GLTFLoader renames the duplicate bones (Head, Head_1, ...).
 * Hair is rebound and animations play by bone name, so put the file's names
 * back. All skins share one joint order.
 */
export function restoreBoneNames(gltf: GLTF): void {
  const json = gltf.parser.json as { skins?: { joints: number[] }[]; nodes: { name?: string }[] };
  const names = (json.skins?.[0]?.joints ?? []).map((j) => PropertyBinding.sanitizeNodeName(json.nodes[j]?.name ?? ''));
  gltf.scene.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh || m.skeleton.bones.length !== names.length) return;
    m.skeleton.bones.forEach((b, i) => {
      if (names[i]) b.name = names[i];
    });
  });
}

export function splitTrack(name: string): [string, string] {
  const i = name.lastIndexOf('.');
  return [name.slice(0, i), name.slice(i + 1)];
}

/** Stores each vertex's rest-pose position (body space, metres) for the clothes shader. */
export function addRest(mesh: SkinnedMesh, bodyInverse: Matrix4): void {
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
