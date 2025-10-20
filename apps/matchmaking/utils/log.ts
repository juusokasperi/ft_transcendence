import pino from 'pino';
import ecsFormat from '@elastic/ecs-pino-format';

const isDev = process.env.NODE_ENV === 'development';

const logger = isDev
  ? pino({
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    })
  : pino({
      level: 'info',
      base: { service: 'matchmaking' },
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
