import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import fastify from 'fastify';
import { statusRoutes } from '../../routes/status.ts';

vi.mock('../../db/queries/tournaments.ts', () => ({
  countTournamentsByStatus: vi.fn(),
}));

vi.mock('../../services/liveStats.ts', () => ({
  getLiveMatchSnapshot: vi.fn(),
}));

import { countTournamentsByStatus } from '../../db/queries/tournaments.ts';
import { getLiveMatchSnapshot } from '../../services/liveStats.ts';

function buildApp() {
  const app = fastify({ logger: false });
  app.register(statusRoutes, { prefix: '/api/status' });
  return app;
}

describe('statusRoutes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns live snapshot and tournament count', async () => {
    const snapshot = {
      matches: 8,
      source: 'prometheus' as const,
      updatedAt: new Date().toISOString(),
    };
    (getLiveMatchSnapshot as Mock).mockResolvedValue(snapshot);
    (countTournamentsByStatus as Mock).mockReturnValue(3);

    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/status/live' });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toEqual({
      ...snapshot,
      tournaments: 3,
    });
    await app.close();
  });

  it('returns 500 when snapshot retrieval fails', async () => {
    (getLiveMatchSnapshot as Mock).mockRejectedValue(new Error('boom'));
    (countTournamentsByStatus as Mock).mockReturnValue(0);

    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/status/live' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: 'Failed to fetch live status' });
    await app.close();
  });
});
