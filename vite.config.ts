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
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
