import { defineConfig } from 'vitest/config';

// The build machine's environment (no Node types in this project).
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

// Deployed to GitHub Pages at https://jxstrr0.github.io/SeasonTicket/
export default defineConfig({
  base: '/SeasonTicket/',
  // Shown in problem reports so a report names the exact build.
  define: { __BUILD_ID__: JSON.stringify((env.GITHUB_SHA ?? 'dev').slice(0, 7)) },
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
