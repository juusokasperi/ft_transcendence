import fastifyMetrics from 'fastify-metrics';
import { FastifyInstance } from 'fastify';

export const registerMetrics = (app: FastifyInstance) => {
  app.register(fastifyMetrics, {
    endpoint: '/metrics', // Prometheus scrape endpoint
    enableDefaultMetrics: true, // Node.js process metrics
  });
};
