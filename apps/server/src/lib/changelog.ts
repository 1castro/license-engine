import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads the project CHANGELOG.md at request time. The file lives at the repo
 * root; the working directory differs between dev (`apps/server`) and the
 * standalone production build (`/app`), so we probe a few known locations.
 *
 * Server-only — never import this from a client component.
 */
let cached: string | null = null;

const CANDIDATE_PATHS = [
  join(process.cwd(), 'CHANGELOG.md'), // standalone runtime: /app/CHANGELOG.md
  join(process.cwd(), '../../CHANGELOG.md'), // dev: apps/server -> repo root
];

export function readChangelog(): string {
  if (cached !== null) return cached;
  for (const p of CANDIDATE_PATHS) {
    try {
      cached = readFileSync(p, 'utf8');
      return cached;
    } catch {
      // try next candidate
    }
  }
  cached = '# Changelog\n\nKeine Changelog-Datei gefunden.';
  return cached;
}
