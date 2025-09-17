import fastifyMetrics from 'fastify-metrics';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const metricsOptions = {
  endpoint: '/metrics',
  defaultMetrics: { enabled: true },
};

export const registerMetrics = (app: FastifyInstance): void => {
  app.register(
    fastifyMetrics as unknown as FastifyPluginAsync<typeof metricsOptions>,
    metricsOptions,
  );
};
