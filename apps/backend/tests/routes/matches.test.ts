// tests/routes/users.me.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi, type Mock } from 'vitest';
import fastify from 'fastify';
import cookie from '@fastify/cookie';

// 1) Mock config BEFORE importing app code (safe: no external refs)
vi.mock('../../utils/config.ts', () => ({
  MATCH_SECRET: 'testsecret',
  SECRET: 'testsecret',
  REFRESH_SECRET: 'refreshsecret',
  DATABASE_PATH: ':memory:',
  JWT_ACCESS_TTL: '4h',
  JWT_REFRESH_TTL: '30d',
  JWT_2FA_TTL: '10m',
  TFA_CODE_DIGITS: 6,
  TFA_ISSUER: 'TestApp',
  ACCESS_TOKEN_COOKIE_NAME: 'token',
  REFRESH_TOKEN_COOKIE_NAME: 'refresh_token',
  TOURNAMENT_REQUIRED_PARTICIPANTS: 4,
  REDIS_URL: 'redis://localhost:6379',
}));

vi.mock('../../db/client.ts', () => ({
  default: {
    transaction: vi.fn((callback: any) => callback),
  },
}));

// 2) Mock the DB queries INSIDE the factory (no top-level refs!)
vi.mock('../../db/queries/users.ts', () => {
  return {
    getUserByUuid: vi.fn(),
    getUserStats: vi.fn(),
    updateUserRanking: vi.fn(),
    getMatchesWithPlayersForUser: vi.fn(),
  };
});

vi.mock('../../db/queries/matches.ts', () => {
  return {
    addMatch: vi.fn(),
    addMatchHelper: vi.fn(),
    addMatchPlayer: vi.fn(),
    getMatchesWithPlayersForUser: vi.fn(),
  };
});

// 3) Now import modules that use those mocks
import * as usersQueries from '../../db/queries/users.ts';
import * as matchesQueries from '../../db/queries/matches.ts';
import { matchRoutes } from '../../routes/matches.ts';
import { userRoutes } from '../../routes/users.ts';
import jwt from 'jsonwebtoken';
import { signAccessToken } from '../../utils/jwt.ts';

function buildApp() {
  const app = fastify({ logger: false });
  app.register(cookie);
  app.register(matchRoutes, { prefix: '/api/matches' });
  app.register(userRoutes, { prefix: '/api/users' });
  return app;
}

const MATCH_SECRET = 'testsecret';
const SECRET = 'testsecret';

const makeMatchToken = () =>
  jwt.sign({ service: 'game-node', iat: Math.floor(Date.now() / 1000) }, MATCH_SECRET, {
    expiresIn: '1h',
  });
const makeUserToken = (uuid: string) => signAccessToken({ uuid, username: 'tester' });

/*
  POST /api/matches/
*/

describe('POST /api/matches', () => {
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
      url: '/api/matches',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        team1Players: ['uuid-1'],
        team2Players: ['uuid-2'],
        team1Score: 11,
        team2Score: 5,
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Missing match authorization token/i);
  });

  it('401 when token is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/matches',
      headers: { authorization: `Bearer invalid-token` },
      body: {
        team1Players: ['uuid-1'],
        team2Players: ['uuid-2'],
        team1Score: 11,
        team2Score: 5,
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Invalid or expired match service token/i);
  });

  it('500 when user not found', async () => {
    (usersQueries.getUserStats as unknown as Mock)
      .mockReturnValueOnce({ uuid: 'uuid-1', ranking: 1000 })
      .mockReturnValueOnce(null);
    const matchToken = makeMatchToken();

    const body = {
      team1Players: ['uuid-1'],
      team2Players: ['uuid-2'],
      team1Score: 11,
      team2Score: 5,
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/matches',
      headers: { authorization: `Bearer ${matchToken}` },
      body,
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toMatch(/Failed to add match results to database/i);
    expect(res.json().error).toMatch(/One or more players not found in database/i);
  });

  it('200 returns { message, matchId, eloChanges: { team1: [{ uuid, delta }], team2: [{ uuid, delta}] } }', async () => {
    (usersQueries.getUserStats as unknown as Mock)
      .mockReturnValueOnce({ uuid: 'uuid-1', ranking: 800 })
      .mockReturnValueOnce({ uuid: 'uuid-2', ranking: 2200 });

    (matchesQueries.addMatch as unknown as Mock).mockReturnValueOnce(123);
    (usersQueries.updateUserRanking as unknown as Mock).mockReturnValue(true);

    const matchToken = makeMatchToken();
    const res = await app.inject({
      method: 'POST',
      url: '/api/matches',
      headers: { authorization: `Bearer ${matchToken}` },
      body: {
        team1Players: ['uuid-1'],
        team2Players: ['uuid-2'],
        team1Score: 11,
        team2Score: 5,
      },
    });

    expect(res.statusCode).toBe(200);
    const responseData = res.json();
    expect(responseData).toEqual({
      message: 'Match successfully added to database',
      matchId: 123,
      eloChanges: {
        team1: expect.arrayContaining([
          expect.objectContaining({
            uuid: expect.any(String),
            delta: expect.any(Number),
          }),
        ]),
        team2: expect.arrayContaining([
          expect.objectContaining({
            uuid: expect.any(String),
            delta: expect.any(Number),
          }),
        ]),
      },
    });
    expect(usersQueries.getUserStats).toHaveBeenCalledTimes(2);
    expect(usersQueries.getUserStats).toHaveBeenCalledWith('uuid-1');
    expect(usersQueries.getUserStats).toHaveBeenCalledWith('uuid-2');
    expect(matchesQueries.addMatch).toHaveBeenCalledTimes(1);
    expect(usersQueries.updateUserRanking).toHaveBeenCalledTimes(2);

    const eloChanges = responseData.eloChanges;
    expect(eloChanges.team1[0].delta).toBeGreaterThan(0);
    expect(eloChanges.team2[0].delta).toBeLessThan(0);
    expect(usersQueries.updateUserRanking).toHaveBeenCalledWith(
      'uuid-1',
      800 + eloChanges.team1[0].delta,
    );
    expect(usersQueries.updateUserRanking).toHaveBeenCalledWith(
      'uuid-2',
      2200 + eloChanges.team2[0].delta,
    );
  });
});

/*
  GET /api/matches
*/

describe('GET /api/matches', () => {
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
      method: 'GET',
      url: '/api/matches',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Missing or invalid token/i);
  });

  it('401 when token is invalid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/matches',
      headers: { cookie: `token=not-a-valid-jwt` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Invalid or expired token/i);
  });

  it('200 returns array of { id, team1Score, team2Score, players, playedAt, tournamentId, tournamentStage }', async () => {
    (matchesQueries.getMatchesWithPlayersForUser as unknown as Mock).mockReturnValueOnce([
      {
        id: 1,
        team1Score: 11,
        team2Score: 5,
        players: {
          team1: [
            {
              uuid: 'uuid-1',
              username: 'Joe',
              avatar: 'avatar1.png',
              ranking: 1000,
              createdAt: '2024-01-01T00:00:00Z',
              rankingDelta: 10,
            },
          ],
          team2: [
            {
              uuid: 'uuid-2',
              username: 'Bob',
              avatar: 'avatar2.png',
              ranking: 1800,
              createdAt: '2024-01-03T12:30:00Z',
              rankingDelta: 5,
            },
          ],
        },
        playedAt: '2024-01-15T10:30:00Z',
        tournamentId: null,
        tournamentStage: null,
      },
      {
        id: 2,
        team1Score: 8,
        team2Score: 11,
        players: {
          team1: [
            {
              uuid: 'uuid-1',
              username: 'Joe',
              avatar: 'avatar1.png',
              ranking: 1000,
              createdAt: '2024-01-01T00:00:00Z',
              rankingDelta: 3,
            },
          ],
          team2: [
            {
              uuid: 'uuid-3',
              username: 'Alice',
              avatar: null,
              ranking: 900,
              createdAt: '2024-01-05T12:30:00Z',
              rankingDelta: -5,
            },
          ],
        },
        playedAt: '2024-01-20T10:30:00Z',
        tournamentId: 1,
        tournamentStage: 'final',
      },
    ]);

    const userToken = makeUserToken('uuid-1');
    const res = await app.inject({
      method: 'GET',
      url: '/api/matches',
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const responseData = res.json();
    expect(Array.isArray(responseData)).toBe(true);
    expect(responseData).toHaveLength(2);

    expect(responseData[0]).toEqual({
      id: expect.any(Number),
      team1Score: expect.any(Number),
      team2Score: expect.any(Number),
      players: {
        team1: expect.any(Array),
        team2: expect.any(Array),
      },
      playedAt: expect.any(String),
      tournamentId: null,
      tournamentStage: null,
    });

    expect(responseData[0].players.team1[0]).toEqual({
      uuid: expect.any(String),
      username: expect.any(String),
      avatar: expect.any(String),
      ranking: expect.any(Number),
      createdAt: expect.any(String),
      rankingDelta: expect.any(Number),
    });

    expect(responseData[1].tournamentId).toBe(1);
    expect(responseData[1].tournamentStage).toBe('final');
    expect(matchesQueries.getMatchesWithPlayersForUser).toHaveBeenCalledWith(
      'uuid-1',
      undefined,
      undefined,
    );
  });
});

/*
  GET /api/users/:uuid/matches
*/

describe('GET /api/users/:uuid/matches', () => {
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
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${validUuid}/matches`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Missing or invalid token/i);
  });

  it('401 when token is invalid', async () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${validUuid}/matches`,
      headers: { cookie: `token=not-a-valid-jwt` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Invalid or expired token/i);
  });

  it('200 returns array of { id, team1Score, team2Score, players, playedAt, tournamentId, tournamentStage }', async () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    (usersQueries.getUserByUuid as unknown as Mock).mockReturnValueOnce({
      uuid: validUuid,
      username: 'Joe',
      avatar: 'avatar1.png',
      ranking: 1000,
      createdAt: '2024-01-01T00:00:00Z',
    });
    (matchesQueries.getMatchesWithPlayersForUser as unknown as Mock).mockReturnValueOnce([
      {
        id: 1,
        team1Score: 11,
        team2Score: 5,
        players: {
          team1: [
            {
              uuid: `${validUuid}`,
              username: 'Joe',
              avatar: 'avatar1.png',
              ranking: 1000,
              createdAt: '2024-01-01T00:00:00Z',
              rankingDelta: 25,
            },
          ],
          team2: [
            {
              uuid: 'uuid-1',
              username: 'Bob',
              avatar: 'avatar2.png',
              ranking: 1800,
              createdAt: '2024-01-03T12:30:00Z',
              rankingDelta: -25,
            },
          ],
        },
        playedAt: '2024-01-15T10:30:00Z',
        tournamentId: null,
        tournamentStage: null,
      },
      {
        id: 2,
        team1Score: 8,
        team2Score: 11,
        players: {
          team1: [
            {
              uuid: `${validUuid}`,
              username: 'Joe',
              avatar: 'avatar1.png',
              ranking: 1000,
              createdAt: '2024-01-01T00:00:00Z',
              rankingDelta: 30,
            },
          ],
          team2: [
            {
              uuid: 'uuid-3',
              username: 'Alice',
              avatar: null,
              ranking: 900,
              createdAt: '2024-01-05T12:30:00Z',
              rankingDelta: -30,
            },
          ],
        },
        playedAt: '2024-01-20T10:30:00Z',
        tournamentId: 1,
        tournamentStage: 'final',
      },
    ]);

    const userToken = makeUserToken('uuid-1');
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${validUuid}/matches`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const responseData = res.json();
    expect(Array.isArray(responseData)).toBe(true);
    expect(responseData).toHaveLength(2);

    expect(responseData[0]).toEqual({
      id: expect.any(Number),
      team1Score: expect.any(Number),
      team2Score: expect.any(Number),
      players: {
        team1: expect.any(Array),
        team2: expect.any(Array),
      },
      playedAt: expect.any(String),
      tournamentId: null,
      tournamentStage: null,
    });

    expect(responseData[0].players.team1[0]).toEqual({
      uuid: expect.any(String),
      username: expect.any(String),
      avatar: expect.any(String),
      ranking: expect.any(Number),
      createdAt: expect.any(String),
      rankingDelta: expect.any(Number),
    });

    expect(responseData[1].tournamentId).toBe(1);
    expect(responseData[1].tournamentStage).toBe('final');
    expect(matchesQueries.getMatchesWithPlayersForUser).toHaveBeenCalledWith(
      validUuid,
      undefined,
      undefined,
    );
  });
});
