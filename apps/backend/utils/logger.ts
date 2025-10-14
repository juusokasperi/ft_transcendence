import type { FastifyBaseLogger } from 'fastify';

let logger: FastifyBaseLogger;

export function setLogger(l: FastifyBaseLogger) {
  logger = l;
}

export function getLogger(): FastifyBaseLogger {
  if (!logger) {
    throw new Error('Logger not initialized yet');
  }
  return logger;
}
