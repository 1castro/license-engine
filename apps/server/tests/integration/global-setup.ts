import { execSync } from 'node:child_process';

/**
 * Runs once before the integration suite: applies all migrations to the test
 * database. DATABASE_URL is provided by the `test:integration` npm script and
 * points at the throwaway Postgres (port 5433).
 */
export default function setup() {
  const url = process.env.DATABASE_URL;
  // Hard guard against ever truncating a real database: require the exact test
  // host + port + db name, not just a substring match.
  let ok = false;
  try {
    const u = new URL(url ?? '');
    ok =
      ['localhost', '127.0.0.1'].includes(u.hostname) &&
      u.port === '5433' &&
      u.pathname.replace(/^\//, '').startsWith('license_engine_test');
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      'Integration tests must run against the test DB (localhost:5433/license_engine_test). ' +
        'Use `pnpm test:integration` (it sets DATABASE_URL + starts docker-compose.test.yml).',
    );
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
}
