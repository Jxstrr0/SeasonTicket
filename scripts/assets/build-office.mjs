// Builds the HQ Office assets in public/assets/office from downloaded CC0 source art.
//
//   node build-office.mjs <source-dir>
//
// <source-dir> holds:
//   ph/<id>/<id>.gltf        Poly Haven props (fetch-polyhaven.py)
//   tex/<id>_{diff,nor,arm}.jpg Poly Haven surface textures (fetch-polyhaven.py)
//   tex/<id>_{diff,nor,ao,rough}.jpg ambientCG surface textures (fetch-ambientcg.py)
//   ubc/                     Quaternius "Universal Base Characters [Standard]" unzipped
//   ual/                     Quaternius "Universal Animation Library [Standard]" unzipped
//
// Needs KTX-Software's `toktx` on PATH (https://github.com/KhronosGroup/KTX-Software).
// Output:
//   props.glb   every prop as a named root node, textures KTX2, geometry Meshopt
//   people.glb  two base bodies and a few hairstyles, all on the same 65-bone rig
//   anims.glb   only the clips the office uses, no mesh
//   *.ktx2      carpet, parquet and wall textures
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, resample, textureCompress, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(process.argv[2] ?? '');
const OUT = resolve(here, '../../public/assets/office');
const TMP = mkdtempSync(join(tmpdir(), 'office-'));
const CLI = join(here, 'node_modules/.bin/gltf-transform');

const PROPS = [
  'metal_office_desk', 'classic_laptop', 'modern_arm_chair_01', 'potted_plant_04',
  'desk_lamp_arm_01', 'wall_clock', 'wooden_display_shelves_01', 'Sofa_01',
  'modern_coffee_table_01', 'hanging_picture_frame_02', 'clipboard',
  'modern_ceiling_lamp_01', 'football',
];
/** ambientCG surface ids (fetch-ambientcg.py); the rest come from Poly Haven. */
const AMBIENTCG = ['Carpet012'];
const CLIPS = [
  'Idle_Loop', 'Idle_Talking_Loop', 'Walk_Formal_Loop', 'Walk_Loop', 'Interact',
  'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Sitting_Exit',
];
const HAIR = ['Hair_Buzzed', 'Hair_SimpleParted', 'Hair_Long', 'Hair_Buns', 'Hair_Beard'];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const cli = (...args) => execFileSync(CLI, args, { stdio: ['ignore', 'ignore', 'inherit'] });

/** Read a .gltf/.glb. Some source .gltf files name textures that ship under a slightly different file name. */
async function read(file) {
  if (!file.endsWith('.gltf')) return io.read(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const dir = dirname(file);
  const resources = {};
  const load = (uri) => {
    const candidates = [uri, uri.replace(/_png\.png$/, '.png'), uri.replace(/\.png$/, '_png.png')];
    const hit = candidates.find((u) => existsSync(join(dir, decodeURIComponent(u))));
    if (!hit) throw new Error(`missing ${uri} next to ${file}`);
    resources[uri] = new Uint8Array(readFileSync(join(dir, decodeURIComponent(hit))));
  };
  for (const b of json.buffers ?? []) if (b.uri) load(b.uri);
  for (const i of json.images ?? []) if (i.uri) load(i.uri);
  return io.readJSON({ json, resources });
}

/** Merge several source files into one document, each under a named root node. */
async function mergeAs(entries) {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('Scene');
  for (const { name, file } of entries) {
    const src = await read(file);
    mergeDocuments(doc, src);
    const group = doc.createNode(name);
    for (const s of doc.getRoot().listScenes()) {
      if (s === scene) continue;
      for (const child of s.listChildren()) group.addChild(child);
      s.dispose();
    }
    scene.addChild(group);
  }
  await doc.transform(unpartition());
  return doc;
}

/** Write doc, then KTX2 its textures (ETC1S colour, UASTC normals) and Meshopt it. */
async function finish(doc, out, { size, normalSize }) {
  await doc.transform(
    dedup(),
    prune({ keepAttributes: false, keepLeaves: true }),
    textureCompress({ encoder: sharp, resize: [size, size], pattern: /^(?!.*nor).*$/i }),
    textureCompress({ encoder: sharp, resize: [normalSize, normalSize], pattern: /nor/i }),
  );
  const a = join(TMP, 'a.glb');
  const b = join(TMP, 'b.glb');
  const c = join(TMP, 'c.glb');
  await io.write(a, doc);
  cli('uastc', a, b, '--slots', 'normalTexture', '--level', '2', '--rdo', '--zstd', '18');
  cli('etc1s', b, c, '--quality', '160');
  cli('meshopt', c, out, '--level', 'medium');
}

async function buildProps() {
  const doc = await mergeAs(PROPS.map((id) => ({ name: id, file: join(SRC, 'ph', id, `${id}.gltf`) })));
  await finish(doc, join(OUT, 'props.glb'), { size: 512, normalSize: 256 });
}

async function buildPeople() {
  const base = join(SRC, 'ubc/Base Characters/Godot - UE');
  const hair = join(SRC, 'ubc/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)');
  const doc = await mergeAs([
    { name: 'body_m', file: join(base, 'Superhero_Male_FullBody.gltf') },
    { name: 'body_f', file: join(base, 'Superhero_Female_FullBody.gltf') },
    ...HAIR.map((h) => ({ name: h.toLowerCase(), file: join(hair, `${h}.gltf`) })),
  ]);
  // The office paints clothes over the body at runtime, so the muscle normal and
  // roughness maps only cost download; hair keeps its normal map.
  for (const mat of doc.getRoot().listMaterials()) {
    if (/Superhero/.test(mat.getName())) {
      mat.setNormalTexture(null);
      mat.setMetallicRoughnessTexture(null);
      mat.setRoughnessFactor(0.75).setMetallicFactor(0);
    }
  }
  await finish(doc, join(OUT, 'people.glb'), { size: 512, normalSize: 256 });
}

async function buildAnims() {
  const doc = await io.read(join(SRC, 'ual/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb'));
  const root = doc.getRoot();
  for (const anim of root.listAnimations()) if (!CLIPS.includes(anim.getName())) anim.dispose();
  for (const node of root.listNodes()) node.setMesh(null);
  for (const mesh of root.listMeshes()) mesh.dispose();
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
  const a = join(TMP, 'anims.glb');
  await io.write(a, doc);
  cli('meshopt', a, join(OUT, 'anims.glb'), '--level', 'medium');
}

/** ambientCG ships AO and roughness separately: pack them as R = AO, G = rough, B = metal (0). */
async function packArm(id) {
  const dir = join(SRC, 'tex');
  const ao = sharp(join(dir, `${id}_ao.jpg`)).greyscale();
  const { width, height } = await ao.metadata();
  const rough = await sharp(join(dir, `${id}_rough.jpg`)).greyscale().resize(width, height).raw().toBuffer();
  const black = Buffer.alloc(width * height);
  await ao
    .joinChannel([rough, black], { raw: { width, height, channels: 1 } })
    .toColourspace('srgb')
    .jpeg({ quality: 92 })
    .toFile(join(dir, `${id}_arm.jpg`));
}

/** Surface textures for the procedural room. Colour is sRGB ETC1S, normals UASTC. */
async function buildSurfaces() {
  for (const id of AMBIENTCG) await packArm(id);
  for (const id of ['herringbone_parquet', 'beige_wall_001', ...AMBIENTCG]) {
    for (const [map, args] of [
      ['diff', ['--encode', 'etc1s', '--qlevel', '160', '--assign_oetf', 'srgb']],
      ['arm', ['--encode', 'etc1s', '--qlevel', '128', '--assign_oetf', 'linear']],
      ['nor', ['--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '1', '--zcmp', '18', '--assign_oetf', 'linear']],
    ]) {
      const size = map === 'nor' ? 512 : 1024;
      execFileSync('toktx', ['--t2', '--genmipmap', '--resize', `${size}x${size}`, ...args, join(OUT, `${id}_${map}.ktx2`), join(SRC, 'tex', `${id}_${map}.jpg`)], { stdio: 'inherit' });
    }
  }
}

mkdirSync(OUT, { recursive: true });
try {
  const only = process.argv[3];
  if (!only || only === 'props') await buildProps();
  if (!only || only === 'people') await buildPeople();
  if (!only || only === 'anims') await buildAnims();
  if (!only || only === 'surfaces') await buildSurfaces();
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
let total = 0;
for (const f of readdirSync(OUT)) {
  const n = statSync(join(OUT, f)).size;
  total += n;
  console.log(`${f.padEnd(34)} ${(n / 1024).toFixed(0).padStart(6)} KB`);
}
console.log(`${'total'.padEnd(34)} ${(total / 1024).toFixed(0).padStart(6)} KB`);
