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

const redis = new Redis(REDIS_URL);
const isDev = process.env.NODE_ENV === 'development';
const MATCHES_SOFT_CAP = 200;

const app = fastify({
  logger: createFastifyLoggerConfig({ service: 'scorer' }),
});

registerMetrics(app, { labels: { service: 'scorer' } });

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

function parsePrometheusText(text: string, metricName: string) {
  const regex = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+([0-9eE.+-]+)$`, 'm');
  const match = text.match(regex);
  return match && typeof match[1] === 'string' ? parseFloat(match[1]) : null;
}

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
