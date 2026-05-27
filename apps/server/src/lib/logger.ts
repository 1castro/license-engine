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
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
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
