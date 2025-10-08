import type { FastifyInstance } from 'fastify';
import { purgeExpiredRefreshTokens } from '../db/queries/refreshTokens.ts';
import { purgeExpiredEmailChangeRequests } from '../db/queries/users.ts';
import { purgeExpiredPasswordResetTokens } from '../db/queries/passwordResets.ts';

type SchedulerConfig = {
  intervalMs: number;
  runner: () => void;
  periodicFailureMessage: string;
  initialFailureMessage: string;
};

const THIRTY_MINUTES_MS = 1000 * 60 * 30;

const SCHEDULERS: SchedulerConfig[] = [
  {
    intervalMs: THIRTY_MINUTES_MS,
    runner: () => purgeExpiredRefreshTokens(new Date().toISOString()),
    periodicFailureMessage: 'Failed to purge expired refresh tokens',
    initialFailureMessage: 'Initial refresh token purge failed',
  },
  {
    intervalMs: THIRTY_MINUTES_MS,
    runner: () => purgeExpiredEmailChangeRequests(),
    periodicFailureMessage: 'Failed to purge expired email change requests',
    initialFailureMessage: 'Initial email change request purge failed',
  },
  {
    intervalMs: THIRTY_MINUTES_MS,
    runner: () => purgeExpiredPasswordResetTokens(),
    periodicFailureMessage: 'Failed to purge expired password reset tokens',
    initialFailureMessage: 'Initial password reset purge failed',
  },
];

export function setupPurgeSchedulers(app: FastifyInstance): () => void {
  const timers: NodeJS.Timeout[] = [];

  for (const scheduler of SCHEDULERS) {
    const timer = setInterval(() => {
      try {
        scheduler.runner();
      } catch (err) {
        app.log.warn({ err }, scheduler.periodicFailureMessage);
      }
    }, scheduler.intervalMs);

    timer.unref();
    timers.push(timer);

    try {
      scheduler.runner();
    } catch (err) {
      app.log.warn({ err }, scheduler.initialFailureMessage);
    }
  }

  return () => {
    for (const timer of timers) clearInterval(timer);
  };
}
