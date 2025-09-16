// tests/routes/users.me.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi, type Mock } from 'vitest';
import fastify from 'fastify';

// 1) Mock config BEFORE importing app code (safe: no external refs)
vi.mock('../../utils/config.ts', () => ({
  GAME_SECRET: 'testsecret',
  DATABASE_PATH: ':memory:',
}));

vi.mock('../../db/client.ts', () => ({
  default: {
    transaction: vi.fn((callback: any) => callback),
  },
}));

// 2) Mock the DB queries INSIDE the factory (no top-level refs!)
vi.mock('../../db/queries/users.ts', () => {
  return {
    getUserStats: vi.fn(),
    updateUserRanking: vi.fn(),
  };
});

vi.mock('../../db/queries/games.ts', () => {
  return {
    addGame: vi.fn(),
    addGameHelper: vi.fn(),
    addGamePlayerHelper: vi.fn(),
  };
});

// 3) Now import modules that use those mocks
import * as usersQueries from '../../db/queries/users.ts';
import * as gamesQueries from '../../db/queries/games.ts';
import { gamesRoutes } from '../../routes/games.ts';
import jwt from 'jsonwebtoken';

function buildApp() {
  const app = fastify({ logger: false });
  app.register(gamesRoutes, { prefix: '/api/games' });
  return app;
}

const GAME_SECRET = 'testsecret';
const makeToken = () => jwt.sign({ service: 'game-node', iat: Math.floor(Date.now() / 1000) }, GAME_SECRET, { expiresIn: '1h' });

describe('POST /api/games', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('401 when token is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        team1Players: ["uuid-1"],
        team2Players: ["uuid-2"],
        team1Score: 11,
        team2Score: 5
      }
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Missing game authorization token/i);
  });

  it('401 when token is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: { authorization: `Bearer invalid-token` },
      body: {
        team1Players: ["uuid-1"],
        team2Players: ["uuid-2"],
        team1Score: 11,
        team2Score: 5
      }
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Invalid or expired game service token/i);
  });

  it('500 when user not found', async () => {
    (usersQueries.getUserStats as unknown as Mock).mockReturnValueOnce(null);
    const token = makeToken();

    const body = {
      team1Players: ["uuid-1"],
      team2Players: ["uuid-2"],
      team1Score: 11,
      team2Score: 5
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: { authorization: `Bearer ${token}` },
      body
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toMatch(/Failed to add game results to database/i);
  });

  it('200 returns { message, gameId, eloChanges: { team1, team2 } }', async () => {
    (usersQueries.getUserStats as unknown as Mock)
      .mockReturnValueOnce({ uuid: 'uuid-1', ranking: 1000 })
      .mockReturnValueOnce({ uuid: 'uuid-2', ranking: 1500 });

    (gamesQueries.addGame as unknown as Mock).mockReturnValueOnce(123);
    (usersQueries.updateUserRanking as unknown as Mock)
      .mockReturnValue(true)
      .mockReturnValueOnce(true);

    const token = makeToken();
    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: { authorization: `Bearer ${token}` },
      body: {
        team1Players: ["uuid-1"],
        team2Players: ["uuid-2"],
        team1Score: 11,
        team2Score: 5
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      message: 'Game successfully added to database',
      gameId: 123,
      eloChanges: {
        team1: expect.any(Number),
        team2: expect.any(Number)
      },
    });
    expect(usersQueries.getUserStats).toHaveBeenCalledTimes(2);
    expect(usersQueries.getUserStats).toHaveBeenCalledWith('uuid-1');
    expect(usersQueries.getUserStats).toHaveBeenCalledWith('uuid-2');
    expect(gamesQueries.addGame).toHaveBeenCalledTimes(1);
    expect(usersQueries.updateUserRanking).toHaveBeenCalledTimes(2);
  });
});
