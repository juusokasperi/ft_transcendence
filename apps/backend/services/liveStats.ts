import {
  GAME_NODES_AMOUNT,
  GAME_SERVER_HTTP_PORT,
  GAME_SERVER_SERVICE,
  PROMETHEUS_URL,
} from '../utils/config.ts';

const MATCHES_METRIC = 'game_server_matches';
const PROM_QUERY = `sum(${MATCHES_METRIC})`;
const PROM_TIMEOUT_MS = 2500;
const NODE_TIMEOUT_MS = 1500;

type PrometheusVectorSample = {
  value: [number | string, string];
  metric: Record<string, string>;
};

type PrometheusQueryResponse = {
  status: 'success' | 'error';
  data?: {
    resultType: string;
    result: PrometheusVectorSample[];
  };
};

function parsePrometheusTextMetric(payload: string, metricName: string): number | null {
  const regex = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+([0-9eE.+-]+)$`, 'm');
  const match = payload.match(regex);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isNaN(value) ? null : value;
}

async function fetchWithTimeout(input: string | URL, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function queryPrometheusMatches(): Promise<number | null> {
  if (!PROMETHEUS_URL) return null;
  try {
    const url = new URL('/api/v1/query', PROMETHEUS_URL);
    url.searchParams.set('query', PROM_QUERY);
    const response = await fetchWithTimeout(url, PROM_TIMEOUT_MS);
    if (!response.ok) return null;
    const payload = (await response.json()) as PrometheusQueryResponse;
    if (payload.status !== 'success') return null;
    const sample = payload.data?.result?.[0];
    if (!sample) return 0;
    const raw = sample.value?.[1];
    if (typeof raw !== 'string') return 0;
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    return null;
  }
}

function buildGameServerHttpEndpoints(): string[] {
  const port = GAME_SERVER_HTTP_PORT?.trim();
  if (!port) return [];
  const totalNodes = Math.max(GAME_NODES_AMOUNT || 0, 1);
  const base = (GAME_SERVER_SERVICE || 'game-server').trim();
  const endpoints: string[] = [];
  for (let i = 0; i < totalNodes; i++) {
    const host = i === 0 ? base : `${base}-${i + 1}`;
    endpoints.push(`http://${host}:${port}/metrics`);
  }
  return endpoints;
}

async function queryGameServerFallback(): Promise<number | null> {
  const endpoints = buildGameServerHttpEndpoints();
  if (endpoints.length === 0) return null;
  let total = 0;
  let successfulNodes = 0;

  await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const response = await fetchWithTimeout(endpoint, NODE_TIMEOUT_MS);
        if (!response.ok) return;
        const payload = await response.text();
        const value = parsePrometheusTextMetric(payload, MATCHES_METRIC);
        if (typeof value === 'number') {
          total += value;
          successfulNodes += 1;
        }
      } catch {
        // ignore individual node errors, try remaining endpoints
      }
    }),
  );

  if (successfulNodes === 0) return null;
  return total;
}

export type LiveMatchSnapshot = {
  matches: number;
  source: 'prometheus' | 'game-server' | 'unavailable';
  updatedAt: string;
};

export async function getLiveMatchSnapshot(): Promise<LiveMatchSnapshot> {
  const promMatches = await queryPrometheusMatches();
  if (typeof promMatches === 'number') {
    return {
      matches: promMatches,
      source: 'prometheus',
      updatedAt: new Date().toISOString(),
    };
  }

  const fallbackMatches = await queryGameServerFallback();
  if (typeof fallbackMatches === 'number') {
    return {
      matches: fallbackMatches,
      source: 'game-server',
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    matches: 0,
    source: 'unavailable',
    updatedAt: new Date().toISOString(),
  };
}
