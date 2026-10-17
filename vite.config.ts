import { defineConfig } from 'vitest/config';

// Deployed to GitHub Pages at https://jxstrr0.github.io/SeasonTicket/
export default defineConfig({
  base: '/SeasonTicket/',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    // Time budgets run on their own (npm run test:perf) so other test files don't share the CPU.
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: ['tests/perf/**'] } },
      { extends: true, test: { name: 'perf', include: ['tests/perf/**/*.test.ts'] } },
    ],
  },
});
