import pino from 'pino';
import type { LoggerOptions as PinoLoggerOptions } from 'pino';
import ecsFormat from '@elastic/ecs-pino-format';
import type { FastifyBaseLogger, FastifyServerOptions } from 'fastify';

export interface LoggerOptions {
  service: string;
  isDev?: boolean;
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

function createLoggerConfig(options: LoggerOptions): PinoLoggerOptions {
  const {
    service,
    isDev = process.env.NODE_ENV === 'development',
    level = isDev ? 'debug' : 'info',
  } = options;

  if (isDev) {
    return {
      level,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  // For production, merge ECS format separately
  const ecsConfig = ecsFormat();
  return {
    level,
    base: { service },
    ...ecsConfig,
  } as PinoLoggerOptions;
}

/**
 * Creates a Pino logger instance compatible with Fastify
 */
export function createLogger(options: LoggerOptions): FastifyBaseLogger {
  return pino(createLoggerConfig(options));
}

/**
 * Creates Fastify-compatible logger options
 * This returns configuration that Fastify accepts directly
 */
export function createFastifyLoggerConfig(options: LoggerOptions): FastifyServerOptions['logger'] {
  return createLoggerConfig(options);
}

export const logger = createLogger({ service: 'default' });

export function log(
  message: string,
  context?: Record<string, unknown>,
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info',
): void {
  logger[level](context ?? {}, message);
}

export type { FastifyBaseLogger };
