import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

describe('getLiveMatchSnapshot', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prefers Prometheus data when available', async () => {
    vi.doMock('../../utils/config.ts', () => ({
      PROMETHEUS_URL: 'http://prometheus:9090',
      GAME_NODES_AMOUNT: 2,
      GAME_SERVER_HTTP_PORT: '55554',
      GAME_SERVER_SERVICE: 'game-server',
    }));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { resultType: 'vector', result: [{ metric: {}, value: [0, '6'] }] },
      }),
    } as Response);

    const { getLiveMatchSnapshot } = await import('../../services/liveStats.ts');
    const snapshot = await getLiveMatchSnapshot();

    expect(snapshot.matches).toBe(6);
    expect(snapshot.source).toBe('prometheus');
    expect(typeof snapshot.updatedAt).toBe('string');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to game server metrics when Prometheus fails', async () => {
    vi.doMock('../../utils/config.ts', () => ({
      PROMETHEUS_URL: 'http://prometheus:9090',
      GAME_NODES_AMOUNT: 2,
      GAME_SERVER_HTTP_PORT: '55554',
      GAME_SERVER_SERVICE: 'game-server',
    }));

    fetchMock
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'game_server_matches 3\n',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '# comment\ngame_server_matches 2\n',
      } as Response);

    const { getLiveMatchSnapshot } = await import('../../services/liveStats.ts');
    const snapshot = await getLiveMatchSnapshot();

    expect(snapshot.matches).toBe(5);
    expect(snapshot.source).toBe('game-server');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns unavailable when both Prometheus and nodes fail', async () => {
    vi.doMock('../../utils/config.ts', () => ({
      PROMETHEUS_URL: 'http://prometheus:9090',
      GAME_NODES_AMOUNT: 2,
      GAME_SERVER_HTTP_PORT: '55554',
      GAME_SERVER_SERVICE: 'game-server',
    }));

    fetchMock
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockRejectedValueOnce(new Error('node-1 down'))
      .mockRejectedValueOnce(new Error('node-2 down'));

    const { getLiveMatchSnapshot } = await import('../../services/liveStats.ts');
    const snapshot = await getLiveMatchSnapshot();

    expect(snapshot.matches).toBe(0);
    expect(snapshot.source).toBe('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
