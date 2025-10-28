import pino from 'pino';
import ecsFormat from '@elastic/ecs-pino-format';
import type { FastifyBaseLogger, FastifyServerOptions } from 'fastify';

export interface LoggerOptions {
  service: string;
  isDev?: boolean;
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

function createLoggerConfig(options: LoggerOptions) {
  const {
    service,
    isDev = process.env.NODE_ENV === 'development',
    level = isDev ? 'debug' : 'info',
  } = options;

  return isDev
    ? {
        level,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        level,
        base: { service },
        ...ecsFormat(),
      };
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
export function createFastifyLoggerConfig(
  options: LoggerOptions
): FastifyServerOptions['logger'] {
  return createLoggerConfig(options);
}

export const logger = createLogger({service:'default'});

export function log(
  message: string,
  context?: Record<string, unknown>,
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info',
): void {
  logger[level](context ?? {}, message);
}

export type { FastifyBaseLogger };
