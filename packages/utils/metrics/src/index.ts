import fastifyMetrics from 'fastify-metrics';
import { register, Registry } from 'prom-client';
import type { FastifyInstance } from 'fastify';

export interface MetricsLabels {
  service: string;
  env?: string;
  version?: string;
  [key: string]: string | undefined;
}

export interface MetricsConfig {
  /**
   * Endpoint to expose metrics
   * @default '/metrics'
   */
  endpoint?: string;
  /**
   * Enable default metrics collection
   * @default true
   */
  defaultMetrics?: { enabled: boolean };
  /**
   * Default labels to apply to all metrics
   */
  labels?: MetricsLabels;
  /**
   * Custom prometheus registry
   * @default register (global registry)
   */
  registry?: Registry;
}

const defaultConfig: Required<Omit<MetricsConfig, 'labels' | 'registry'>> = {
  endpoint: '/metrics',
  defaultMetrics: { enabled: true },
};

export const registerMetrics = (app: FastifyInstance, config: MetricsConfig = {}): void => {
  const finalConfig = {
    ...defaultConfig,
    ...config,
  };

  const defaultLabels = {
    env: process.env.NODE_ENV ?? 'dev',
    version: process.env.GIT_SHA ?? 'dev',
  };

  const mergedLabels = {
    ...defaultLabels,
    ...(finalConfig.labels ?? {}),
  };
  const registryToUse = finalConfig.registry ?? register;

  registryToUse.setDefaultLabels(mergedLabels);

  const metricsOptions = {
    endpoint: finalConfig.endpoint,
    defaultMetrics: finalConfig.defaultMetrics,
    register: registryToUse,
  };

  app.register(fastifyMetrics, metricsOptions);
};

// Export prom-client register for direct access if needed
export { register } from 'prom-client';

// Re-export common prom-client types
export type { Counter, Gauge, Histogram, Summary, Registry, Metric } from 'prom-client';
