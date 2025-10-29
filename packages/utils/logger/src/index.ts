import pino from 'pino';
import pinoPretty from 'pino-pretty';
import type { LoggerOptions as PinoLoggerOptions } from 'pino';
import ecsFormat from '@elastic/ecs-pino-format';
import type { FastifyBaseLogger, FastifyServerOptions } from 'fastify';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'log';
export type PinoLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerOptions {
  service: string;
  isDev?: boolean;
  level?: PinoLogLevel;
}

/**
 * Maps 'log' level to 'info' for Pino compatibility
 */
function mapLogLevel(level: LogLevel): PinoLogLevel {
  return level === 'log' ? 'info' : level;
}

function createLoggerConfig(options: LoggerOptions): PinoLoggerOptions {
  const {
    service,
    isDev = process.env.NODE_ENV === 'development',
    level = isDev ? 'debug' : 'info',
  } = options;

  if (isDev) {
    void pinoPretty; // the import is need for run-time even though not used here
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

/**
 * Helper function for structured logging with context
 * Accepts 'log' as a level which maps to 'info'
 */
export function log(
  message: string,
  context?: Record<string, unknown>,
  level: LogLevel = 'info',
): void {
  const pinoLevel = mapLogLevel(level);
  logger[pinoLevel](context ?? {}, message);
}

export type { FastifyBaseLogger };
