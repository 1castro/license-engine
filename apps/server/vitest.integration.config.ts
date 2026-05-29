import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Integration tests — exercise real API route handlers against a real Postgres
 * test database (see docker-compose.test.yml). Kept separate from the unit
 * suite (vitest.config.ts) so `pnpm test` stays DB-free and fast.
 *
 * Run via `pnpm test:integration`, which sets DATABASE_URL + the other required
 * env vars and points at the throwaway DB on port 5433.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
    globalSetup: ['tests/integration/global-setup.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    // Route handlers share module-level singletons (prisma, rate limiters) and
    // one DB — run serially to keep state deterministic.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
