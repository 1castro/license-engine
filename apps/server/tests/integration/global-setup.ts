import { execSync } from 'node:child_process';

/**
 * Runs once before the integration suite: applies all migrations to the test
 * database. DATABASE_URL is provided by the `test:integration` npm script and
 * points at the throwaway Postgres (port 5433).
 */
export default function setup() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes('5433')) {
    throw new Error(
      'Integration tests must run against the test DB on port 5433. ' +
        'Use `pnpm test:integration` (it sets DATABASE_URL + starts docker-compose.test.yml).',
    );
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
}
