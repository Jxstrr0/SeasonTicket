// Packs the town pieces modelled by scenery-kit.py into public/assets/stadium/scenery.glb.
//
//   python3 scenery-kit.py <work-dir>      -> <work-dir>/scenery.json
//   node build-scenery.mjs <work-dir>      -> ../../public/assets/stadium/scenery.glb
//
// Each piece is a named node with one mesh: positions, normals and a colour per vertex
// (red, green and blue as sRGB, alpha the zone: see scenery-kit.py). No textures.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../public/assets/stadium/scenery.glb');
const CLI = join(here, 'node_modules/.bin/gltf-transform');
const work = process.argv[2];
if (!work) {
  console.error('usage: node build-scenery.mjs <work-dir>');
  process.exit(1);
}

const pieces = JSON.parse(readFileSync(join(resolve(work), 'scenery.json'), 'utf8'));
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('scenery');
const material = doc.createMaterial('scenery').setRoughnessFactor(0.9).setMetallicFactor(0);
for (const piece of pieces) {
  const n = piece.positions.length;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Uint8Array(n * 4);
  for (let v = 0; v < n; v++) {
    pos.set(piece.positions[v], v * 3);
    nor.set(piece.normals[v], v * 3);
    const c = piece.colors[v];
    col.set([Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255), c[3]], v * 4);
  }
  const acc = (type, array, normalized = false) => doc.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', pos))
    .setAttribute('NORMAL', acc('VEC3', nor))
    .setAttribute('COLOR_0', acc('VEC4', col, true))
    .setIndices(acc('SCALAR', Uint16Array.from(piece.index)))
    .setMaterial(material);
  scene.addChild(doc.createNode(piece.name).setMesh(doc.createMesh(piece.name).addPrimitive(prim)));
}
const tmp = mkdtempSync(join(tmpdir(), 'scenery-'));
try {
  const a = join(tmp, 'a.glb');
  await new NodeIO().write(a, doc);
  mkdirSync(dirname(OUT), { recursive: true });
  execFileSync(CLI, ['meshopt', a, OUT, '--level', 'medium'], { stdio: ['ignore', 'ignore', 'inherit'] });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`${pieces.length} pieces, scenery.glb ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
