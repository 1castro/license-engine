import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Monorepo root, two levels up from apps/server. Required so `output: standalone`
// traces hoisted workspace node_modules (incl. the Prisma engine) from the
// pnpm workspace root rather than just apps/server.
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../');

// Tight CSP: same-origin scripts/styles, inline allowed (Next.js + Tailwind
// inline css), no framing, no plugins. Tighten further once we know which
// external assets we ship.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  // HSTS: 2 years, include subdomains, opt-in to preload list. Only effective
  // over HTTPS — for local HTTP dev, browsers ignore HSTS on localhost.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Clickjacking defense — Admin and Portal must never embed in an iframe.
  { key: 'X-Frame-Options', value: 'DENY' },
  // MIME-sniffing off — prevents browser from second-guessing Content-Type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Trim referrer info on cross-origin navigation.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable powerful browser features by default.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Content-Security-Policy — narrow allowlist.
  { key: 'Content-Security-Policy', value: CSP },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    // Next.js 14: outputFileTracingRoot lebt unter `experimental` (erst ab 15
    // top-level). Setzt den Monorepo-Root für das standalone-File-Tracing, damit
    // der Prisma-Client + die linux-musl-Engine aus dem pnpm-Store mitgebündelt
    // werden statt nur apps/server.
    outputFileTracingRoot: workspaceRoot,
    serverComponentsExternalPackages: ['@node-rs/argon2', 'pino', 'pino-pretty'],
  },
  async headers() {
    return [
      {
        // Apply to every route, including `/admin`, `/portal`, and all `/api/*` responses.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
