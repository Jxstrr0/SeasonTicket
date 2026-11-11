// Builds the match-day players in public/assets/match/players.glb: the office's base body
// (people.glb, body_m) dressed in a modelled kit by Blender (players-kit.py).
//
//   node build-players.mjs extract <work-dir>     people.glb  -> <work-dir>/body.json
//   python3 players-kit.py <work-dir>             body.json   -> <work-dir>/outfield.json, keeper.json
//   node build-players.mjs pack <work-dir>        the two     -> ../../public/assets/match/players.glb
//
// The skeleton never passes through Blender: the bones in players.glb are the ones in
// people.glb, node for node, so every animation clip and hair piece fits as before. Blender
// only sees the body standing in its rest pose (metres, y up) with each vertex's bone weights.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
const PEOPLE = resolve(here, '../../public/assets/office/people.glb');
const OUT = resolve(here, '../../public/assets/match/players.glb');
const CLI = join(here, 'node_modules/.bin/gltf-transform');
const BODY = 'body_m';
const BODY_MESH = 'SuperHero_Male';
const VARIANTS = ['outfield', 'keeper'];

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

// Column-major 4x4 helpers (glTF's layout).
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function invert(m) {
  const a = m.slice();
  const inv = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const at = (x, r, c) => x[c * 4 + r];
  const set = (x, r, c, v) => { x[c * 4 + r] = v; };
  for (let i = 0; i < 4; i++) {
    let p = i;
    for (let r = i + 1; r < 4; r++) if (Math.abs(at(a, r, i)) > Math.abs(at(a, p, i))) p = r;
    for (let c = 0; c < 4; c++) {
      let t = at(a, i, c); set(a, i, c, at(a, p, c)); set(a, p, c, t);
      t = at(inv, i, c); set(inv, i, c, at(inv, p, c)); set(inv, p, c, t);
    }
    const d = at(a, i, i);
    for (let c = 0; c < 4; c++) { set(a, i, c, at(a, i, c) / d); set(inv, i, c, at(inv, i, c) / d); }
    for (let r = 0; r < 4; r++) {
      if (r === i) continue;
      const f = at(a, r, i);
      for (let c = 0; c < 4; c++) { set(a, r, c, at(a, r, c) - f * at(a, i, c)); set(inv, r, c, at(inv, r, c) - f * at(inv, i, c)); }
    }
  }
  return inv;
}

/** The body's root node, its skinned mesh node and the skin, in a freshly read people.glb. */
async function readBody() {
  const doc = await io.read(PEOPLE);
  const scene = doc.getRoot().listScenes()[0];
  const body = scene.listChildren().find((n) => n.getName() === BODY);
  let meshNode = null;
  body.traverse((n) => { if (n.getName() === BODY_MESH && n.getMesh()) meshNode = n; });
  if (!meshNode) throw new Error(`${BODY} has no ${BODY_MESH}`);
  return { doc, scene, body, meshNode, skin: meshNode.getSkin() };
}

/** body.json: the body in its rest pose, in the body root's space. */
async function extract(work) {
  const { body, meshNode, skin } = await readBody();
  const toBody = invert(body.getWorldMatrix());
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  const mats = joints.map((j, i) => mul(toBody, mul(j.getWorldMatrix(), ibm.getElement(i, []))));
  const prim = meshNode.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION');
  const N = prim.getAttribute('NORMAL');
  const J = prim.getAttribute('JOINTS_0');
  const W = prim.getAttribute('WEIGHTS_0');
  const n = P.getCount();
  const positions = [];
  const normals = [];
  const weights = [];
  for (let v = 0; v < n; v++) {
    const p = P.getElement(v, []);
    const nr = N.getElement(v, []);
    const j = J.getElement(v, []);
    const w = W.getElement(v, []);
    const sum = w[0] + w[1] + w[2] + w[3] || 1;
    const o = [0, 0, 0];
    const on = [0, 0, 0];
    const list = [];
    for (let k = 0; k < 4; k++) {
      const wk = w[k] / sum;
      if (wk <= 0) continue;
      list.push([j[k], wk]);
      const m = mats[j[k]];
      for (let r = 0; r < 3; r++) {
        o[r] += wk * (m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
        on[r] += wk * (m[r] * nr[0] + m[4 + r] * nr[1] + m[8 + r] * nr[2]);
      }
    }
    const len = Math.hypot(...on) || 1;
    positions.push(o);
    normals.push(on.map((x) => x / len));
    weights.push(list);
  }
  const index = Array.from(prim.getIndices().getArray());
  // Where each bone sits at rest, for the kit's shaping (a leg's axis, the waist's height).
  const bones = {};
  joints.forEach((j) => {
    const m = mul(toBody, j.getWorldMatrix());
    bones[j.getName()] = [m[12], m[13], m[14]];
  });
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, 'body.json'), JSON.stringify({ joints: joints.map((j) => j.getName()), bones, positions, normals, weights, index }));
  const ys = positions.map((p) => p[1]);
  console.log(`body.json: ${n} vertices, ${index.length / 3} triangles, ${Math.min(...ys).toFixed(3)} to ${Math.max(...ys).toFixed(3)} m tall`);
}

/** players.glb: the body's own skeleton with the two dressed meshes on it. */
async function pack(work) {
  const { doc, scene, body, skin } = await readBody();
  const root = doc.getRoot();
  // Only the body's root stays; its meshes go, its bones stay.
  for (const n of scene.listChildren()) if (n !== body) n.dispose();
  const old = [];
  body.traverse((n) => { if (n.getMesh()) old.push(n); });
  for (const n of old) n.dispose();
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) if (s !== skin) s.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  // people.glb's compression settings go too; the meshopt step at the end packs the new file.
  for (const e of root.listExtensionsUsed()) e.dispose();
  body.setName('player');

  // The new vertices are where they stand at rest, in the body root's space, so each bone's
  // bind matrix is simply its rest position undone.
  const buffer = root.listBuffers()[0];
  const toBody = invert(body.getWorldMatrix());
  const joints = skin.listJoints();
  const ibm = new Float32Array(joints.length * 16);
  joints.forEach((j, i) => ibm.set(invert(mul(toBody, j.getWorldMatrix())), i * 16));
  skin.setInverseBindMatrices(doc.createAccessor('ibm').setType('MAT4').setArray(ibm).setBuffer(buffer));
  const material = doc.createMaterial('kit').setRoughnessFactor(0.8).setMetallicFactor(0);

  for (const name of VARIANTS) {
    const src = JSON.parse(readFileSync(join(work, `${name}.json`), 'utf8'));
    const n = src.positions.length;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Uint8Array(n * 4);
    const jnt = new Uint8Array(n * 4);
    const wgt = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      pos.set(src.positions[v], v * 3);
      nor.set(src.normals[v], v * 3);
      col.set(src.colors[v], v * 4);
      const list = src.weights[v].slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = list.reduce((s, x) => s + x[1], 0) || 1;
      list.forEach(([j, w], k) => {
        jnt[v * 4 + k] = j;
        wgt[v * 4 + k] = w / sum;
      });
    }
    const acc = (type, array, normalized = false) => doc.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc('VEC3', pos))
      .setAttribute('NORMAL', acc('VEC3', nor))
      .setAttribute('COLOR_0', acc('VEC4', col, true))
      .setAttribute('JOINTS_0', acc('VEC4', jnt))
      .setAttribute('WEIGHTS_0', acc('VEC4', wgt))
      .setIndices(acc('SCALAR', n < 65536 ? Uint16Array.from(src.index) : Uint32Array.from(src.index)))
      .setMaterial(material);
    const node = doc.createNode(`kit_${name}`).setMesh(doc.createMesh(`kit_${name}`).addPrimitive(prim)).setSkin(skin);
    body.addChild(node);
    console.log(`kit_${name}: ${n} vertices, ${src.index.length / 3} triangles`);
  }
  await doc.transform(prune({ keepAttributes: true, keepLeaves: true }));
  const tmp = mkdtempSync(join(tmpdir(), 'players-'));
  try {
    const a = join(tmp, 'a.glb');
    await io.write(a, doc);
    mkdirSync(dirname(OUT), { recursive: true });
    execFileSync(CLI, ['meshopt', a, OUT, '--level', 'medium', '--quantization-volume', 'scene'], { stdio: ['ignore', 'ignore', 'inherit'] });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`players.glb ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
}

const [step, dir] = process.argv.slice(2);
if (!dir || !['extract', 'pack'].includes(step)) {
  console.error('usage: node build-players.mjs extract|pack <work-dir>');
  process.exit(1);
}
if (step === 'extract') await extract(resolve(dir));
else await pack(resolve(dir));
