import Redis from 'ioredis';
import axios from 'axios';
import fastify from 'fastify';
import {
  REDIS_URL,
  PROMETHEUS_URL,
  GAME_NODES_AMOUNT,
  GAME_SERVER_HTTP,
  GAME_SERVER_PORT,
  GAME_SERVER_SERVICE,
  SCORER_PORT,
} from './config';
import { registerMetrics } from '@utils/metrics';
import { createFastifyLoggerConfig } from '@utils/logger';

/**
 * Scorer service
 *
 * Periodically:
 *   - fetches metrics about all game-server nodes from Prometheus (or via HTTP fallback)
 *   - computes a normalized "load score" per node based on CPU, file descriptors, and active matches
 *   - writes those scores to Redis under `game-node:scores`
 *
 * The allocator reads `game-node:scores` to decide which node should host a new room.
 */
const redis = new Redis(REDIS_URL);
const MATCHES_SOFT_CAP = 200;

const app = fastify({
  logger: createFastifyLoggerConfig({ service: 'scorer' }),
});

registerMetrics(app, { labels: { service: 'scorer' } });

// Deterministic list of nodes (game-server, game-server-2, ...) built from config.
const nodes = Array.from({ length: GAME_NODES_AMOUNT }, (_, i) => {
  let host = GAME_SERVER_SERVICE;
  if (i > 0) host += `-${i + 1}`;
  return {
    id: `${host}:${GAME_SERVER_PORT}`,
    http: `http://${host}:${GAME_SERVER_HTTP}`,
    ws: `ws://${host}:${GAME_SERVER_PORT}`,
  };
});

app.get('/health', async () => ({ status: 'ok' }));

/**
 * Query Prometheus for node-level metrics needed to compute scores:
 *   - CPU usage (1-minute rate of process_cpu_seconds_total)
 *   - open file descriptors (process_open_fds)
 *   - max file descriptors (process_max_fds)
 *   - current matches (game_server_matches)
 *
 * Returns a Map keyed by node id (host:port) with the aggregated metrics.
 */
async function getMetricsFromPrometheus() {
  const cpuQuery = `rate(process_cpu_seconds_total{instance=~"game-server.*"}[1m])`;
  const fdQuery = `process_open_fds{instance=~"game-server.*"}`;
  const maxFdQuery = `process_max_fds{instance=~"game-server.*"}`;
  const matchesQuery = `game_server_matches`;

  const [cpuResponse, fdResponse, maxFdResponse, matchesResponse] = await Promise.all([
    axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params: { query: cpuQuery } }),
    axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params: { query: fdQuery } }),
    axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params: { query: maxFdQuery } }),
    axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params: { query: matchesQuery } }),
  ]);

  const metricsByNode = new Map<
    string,
    { cpu: number; fd: number; maxFds: number; matches: number }
  >();

  for (const node of nodes) {
    metricsByNode.set(node.id, { cpu: 0, fd: 0, maxFds: 1024, matches: 0 });
  }

  cpuResponse.data.data.result.forEach((m: any) => {
    const nodeId = m.metric.instance;
    if (metricsByNode.has(nodeId)) metricsByNode.get(nodeId)!.cpu = parseFloat(m.value[1]);
  });

  fdResponse.data.data.result.forEach((m: any) => {
    const nodeId = m.metric.instance;
    if (metricsByNode.has(nodeId)) metricsByNode.get(nodeId)!.fd = parseInt(m.value[1], 10);
  });

  maxFdResponse.data.data.result.forEach((m: any) => {
    const nodeId = m.metric.instance;
    if (metricsByNode.has(nodeId)) metricsByNode.get(nodeId)!.maxFds = parseInt(m.value[1], 10);
  });

  matchesResponse.data.data.result.forEach((m: any) => {
    const nodeId = m.metric.instance;
    if (metricsByNode.has(nodeId)) metricsByNode.get(nodeId)!.matches = parseInt(m.value[1], 10);
  });

  return metricsByNode;
}

/**
 * Parse a single numeric metric from Prometheus text exposition format.
 *
 * Used by the HTTP fallback when Prometheus is not reachable.
 */
function parsePrometheusText(text: string, metricName: string) {
  const regex = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+([0-9eE.+-]+)$`, 'm');
  const match = text.match(regex);
  return match && typeof match[1] === 'string' ? parseFloat(match[1]) : null;
}

/**
 * Fallback scoring path when Prometheus is unavailable:
 *   - queries each game node's `/metrics` endpoint directly
 *   - parses a small subset of metrics (fds, max_fds, matches)
 *   - computes a "score" using fd load and match load
 *   - writes `game-node:scores` entries with `fallback: true`
 *
 * Nodes that fail the HTTP request or for which metrics cannot be parsed
 * are removed from the Redis scores hash.
 */
async function updateScoresFromHttpFallback() {
  //app.log.warn('Executing fallback scoring: querying nodes directly via HTTP.');

  for (const node of nodes) {
    try {
      const res = await axios.get(`${node.http}/metrics`, { timeout: 2000 });
      const metrics = res.data;
      const fd = parsePrometheusText(metrics, 'process_open_fds');
      const maxFds = parsePrometheusText(metrics, 'process_max_fds') || 1024;
      const matches = parsePrometheusText(metrics, 'game_server_matches');
      let score;

      if (fd !== null && matches !== null) {
        const fdLoad = fd / maxFds;
        const matchesLoad = matches / MATCHES_SOFT_CAP;
        score = fdLoad * 0.4 + matchesLoad * 0.6;
        //app.log.debug({ nodeId: node.id, score }, 'Calculated normalized node score via fallback');
      } else {
        app.log.warn({ nodeId: node.id }, 'Fallback: Failed to parse required metrics from node.');
        score = 9999;
      }

      await redis.hset(
        'game-node:scores',
        node.id,
        JSON.stringify({
          id: node.id,
          http: node.http,
          ws: node.ws,
          score: Number(score.toFixed(4)),
          fallback: true,
        }),
      );
    } catch (err) {
      app.log.error(
        { nodeId: node.id, err },
        'Fallback HTTP request failed for node, removing from scores.',
      );
      await redis.hdel('game-node:scores', node.id);
    }
  }
}

/**
 * Main scoring function using Prometheus metrics:
 *   - fetches metrics for all game-server instances
 *   - for each configured node:
 *       * if metrics missing -> remove from scores
 *       * else compute:
 *           cpuLoad    = cpu
 *           fdLoad     = fd / maxFds
 *           matchesLoad = matches / MATCHES_SOFT_CAP
 *         and combine into a single score:
 *           score = cpuLoad * 0.5 + fdLoad * 0.2 + matchesLoad * 0.3
 *   - writes scores to Redis under `game-node:scores`
 *
 * On error (e.g., Prometheus unavailable) falls back to direct HTTP scraping.
 */
async function updateScores() {
  try {
    const metricsByNode = await getMetricsFromPrometheus();

    for (const node of nodes) {
      const metrics = metricsByNode.get(node.id);

      if (!metrics) {
        app.log.warn({ nodeId: node.id }, 'Metrics not found for node, removing from scores.');
        await redis.hdel('game-node:scores', node.id);
        continue;
      }

      const cpuLoad = metrics.cpu;
      const fdLoad = metrics.fd / (metrics.maxFds || 1);
      const matchesLoad = metrics.matches / MATCHES_SOFT_CAP;
      const score = cpuLoad * 0.5 + fdLoad * 0.2 + matchesLoad * 0.3;
      //app.log.debug({ nodeId: node.id, metrics, score }, 'Calculated node score');

      await redis.hset(
        'game-node:scores',
        node.id,
        JSON.stringify({
          id: node.id,
          http: node.http,
          ws: node.ws,
          score: Number(score.toFixed(4)),
        }),
      );
    }
  } catch (err) {
    //app.log.error(err, 'Failed to update scores from Prometheus');
    await updateScoresFromHttpFallback();
  }
}

/**
 * Bootstrap the scorer:
 *   - start Fastify on SCORER_PORT (for health/metrics)
 *   - log configured nodes and Prometheus URL
 *   - schedule periodic score updates (every 5s) and run one immediately
 */
const start = async () => {
  try {
    await app.listen({ port: SCORER_PORT, host: '0.0.0.0' });
    app.log.info(
      { nodes: nodes.map((n) => n.id), prometheusUrl: PROMETHEUS_URL },
      '[Scorer] Running scorer with nodes',
    );
    setInterval(updateScores, 5000);
    updateScores();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
