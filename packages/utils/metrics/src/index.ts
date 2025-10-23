import fastifyMetrics from 'fastify-metrics';
import { register, Registry } from 'prom-client';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

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

export const registerMetrics = async (
  app: FastifyInstance,
  config: MetricsConfig = {},
): Promise<void> => {
  const finalConfig = {
    ...defaultConfig,
    ...config,
  };

  const registryToUse = finalConfig.registry ?? register;

  // Set default labels if provided
  if (finalConfig.labels) {
    registryToUse.setDefaultLabels(finalConfig.labels);
  }

  const metricsOptions = {
    endpoint: finalConfig.endpoint,
    defaultMetrics: finalConfig.defaultMetrics,
    register: registryToUse,
  };

  await app.register(
    fastifyMetrics as unknown as FastifyPluginAsync<typeof metricsOptions>,
    metricsOptions,
  );
};

// Export prom-client register for direct access if needed
export { register } from 'prom-client';

// Re-export common prom-client types
export type { Counter, Gauge, Histogram, Summary, Registry, Metric } from 'prom-client';
