import fastifyMetrics from 'fastify-metrics';
import type { FastifyInstance } from 'fastify';

export const registerMetrics = (app: FastifyInstance) => {
  app.register(fastifyMetrics, {
    endpoint: '/metrics', // Prometheus scrape endpoint
    defaultMetrics: { enabled: true },
  });
};
