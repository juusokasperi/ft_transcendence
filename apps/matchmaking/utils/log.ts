import pino from 'pino';
import ecsFormat from '@elastic/ecs-pino-format';

const logger = pino({
  level: 'info',
  ...ecsFormat(),
});

export function log(
  message: string,
  context?: Record<string, unknown>,
  level: 'log' | 'warn' | 'error' = 'log',
): void {
  const pinoLevel: 'info' | 'warn' | 'error' = level === 'log' ? 'info' : level;
  logger[pinoLevel]({ context }, message);
}
