import { defineConfig, type Plugin } from 'vitest/config';
import { coreFiles, serviceWorkerSource } from './src/pwa/serviceWorker';

// The build machine's environment (no Node types in this project).
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

const BUILD_ID = (env.GITHUB_SHA ?? 'dev').slice(0, 7);
/** Files in public/ the worker stores on install (they are not in the bundle). */
const PUBLIC_CORE = ['manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

/** Writes sw.js beside the built game, listing the files to keep for offline play (src/pwa). */
function serviceWorker(): Plugin {
  return {
    name: 'season-ticket-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = coreFiles([...Object.keys(bundle), ...PUBLIC_CORE]);
      // The bundle's names carry content hashes: a build whose code is unchanged (a docs-only
      // commit) keeps the same store, so players are not asked to update for nothing.
      let hash = 5381;
      for (const ch of files.join()) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
      const build = hash.toString(36);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(build, files) });
    },
  };
}

// Deployed to GitHub Pages at https://jxstrr0.github.io/SeasonTicket/
export default defineConfig({
  base: '/SeasonTicket/',
  // Shown in problem reports so a report names the exact build.
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    // Time budgets run on their own (npm run test:perf) so other test files don't share the CPU.
    projects: [
      // Matches on the spatial engine take a few seconds each; the CI runner is about twice as slow as a dev machine.
      { extends: true, test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: ['tests/perf/**', 'tests/slow/**'], testTimeout: 20_000 } },
      { extends: true, test: { name: 'perf', include: ['tests/perf/**/*.test.ts'] } },
      // Whole seasons on the spatial engine in both modes (minutes): npm run test:slow.
      { extends: true, test: { name: 'slow', include: ['tests/slow/**/*.test.ts'] } },
    ],
  },
});
