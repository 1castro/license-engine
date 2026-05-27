import pino, { type Logger } from 'pino';
import { getEnv } from './env';

let cached: Logger | undefined;

function buildLogger(): Logger {
  const env = getEnv();
  const isDev = env.NODE_ENV === 'development';

  return pino({
    level: env.LOG_LEVEL,
    base: { app: 'license-engine' },
    // Dev: pretty colorized output. Prod: raw JSON to stdout for log aggregation.
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    redact: {
      // Wildcard paths cover both top-level and one-level-nested objects (e.g.
      // `{ user: { password } }` and `{ event: '...', token }`). Pino's redact
      // does NOT recurse — keep the list aligned with what we actually log.
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        '*.password',
        '*.passwordHash',
        '*.secret',
        '*.totpSecret',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.apiKey',
        '*.privateKey',
        '*.privateKeyEncrypted',
        'password',
        'secret',
        'token',
        'apiKey',
        'privateKey',
      ],
      censor: '[redacted]',
    },
  });
}

export function getLogger(): Logger {
  if (!cached) {
    cached = buildLogger();
  }
  return cached;
}
