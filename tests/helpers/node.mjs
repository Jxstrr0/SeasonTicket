/**
 * Node-only helpers for tests: reading source files, bundling a benchmark entry and
 * counting garbage collections. Plain JavaScript so the TypeScript program (which also
 * covers the browser code) does not need Node's global types.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PerformanceObserver } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function readSource(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** A file's size in bytes, or -1 if it is not there. */
export function fileSize(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? statSync(p).size : -1;
}

export function writeSource(rel, text) {
  writeFileSync(join(ROOT, rel), text);
}

export function listSources(relDir, ext = '.ts') {
  return readdirSync(join(ROOT, relDir))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => `${relDir}/${f}`);
}

/** Every file under `relDir`, at any depth, as paths relative to it. */
export function listFilesDeep(relDir) {
  const out = [];
  const walk = (sub) => {
    for (const e of readdirSync(join(ROOT, relDir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

export function envFlag(name) {
  return process.env[name] === '1';
}

/** Bundle `relEntry` with Vite into a temp folder and import it natively. */
export async function bundleAndImport(relEntry) {
  const { build } = await import('vite');
  const outDir = mkdtempSync(join(tmpdir(), 'st-bench-'));
  await build({
    configFile: false,
    logLevel: 'silent',
    build: { ssr: join(ROOT, relEntry), outDir, write: true, emptyOutDir: true, minify: false },
  });
  const name = relEntry.split('/').pop().replace(/\.ts$/, '.js');
  const mod = await import(pathToFileURL(join(outDir, name)).href);
  return { mod, cleanup: () => rmSync(outDir, { recursive: true, force: true }) };
}

/** Run `fn` and count the garbage collections Node reports while it runs. */
export async function countGcs(fn) {
  let count = 0;
  const obs = new PerformanceObserver((list) => { count += list.getEntries().length; });
  obs.observe({ entryTypes: ['gc'] });
  fn();
  await new Promise((r) => setTimeout(r, 50));
  obs.disconnect();
  return count;
}
