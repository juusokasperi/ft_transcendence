// tests/routes/users.me.test.ts
import { describe, it, expect, beforeAll, afterAll, vi, type Mock } from 'vitest';
import fastify from 'fastify';
import cookie from '@fastify/cookie';

// 1) Mock config BEFORE importing app code (safe: no external refs)
vi.mock('../../utils/config.ts', () => ({
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
}));

// 2) Make updateLastSeen a no-op (preHandler requires it)
vi.mock('../../hooks/updateLastSeen.ts', () => ({
  updateLastSeenHandler: (_req: any, _res: any, done: any) => done(),
}));

// 3) Mock the DB queries INSIDE the factory (no top-level refs!)
vi.mock('../../db/queries/users.ts', () => {
  return {
    getUserByUuid: vi.fn(), // we will grab these later from the imported module
    getUserStats: vi.fn(),
    updateUsername: vi.fn(),
    updatePassword: vi.fn(),
    updateAvatar: vi.fn(),
    getUserByUsername: vi.fn(),
    getUserSettings: vi.fn(),
    updateUserSettings: vi.fn(),
  };
});

// 4) Now import modules that use those mocks
import * as usersQueries from '../../db/queries/users.ts';
import { userRoutes } from '../../routes/users.ts';
import { signAccessToken } from '../../utils/jwt.ts';

function buildApp() {
  const app = fastify({ logger: false });
  app.register(cookie);
  app.register(userRoutes, { prefix: '/api/users' });
  return app;
}

const makeToken = (uuid: string) => signAccessToken({ uuid, username: 'tester' });

describe('GET /api/users/me', () => {
  const USER_UUID = '22222222-2222-2222-2222-222222222222';
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('401 when token cookie is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Missing or invalid token/i);
  });

  it('401 when token is invalid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { cookie: `token=not-a-valid-jwt` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/Invalid or expired token/i);
  });

  it('404 when user not found', async () => {
    (usersQueries.getUserByUuid as unknown as Mock).mockReturnValueOnce(null);
    const token = makeToken('33333333-3333-3333-3333-333333333333');

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/User not found/i);
  });

  it('200 returns { username, uuid, avatar }', async () => {
    (usersQueries.getUserByUuid as unknown as Mock).mockReturnValueOnce({
      uuid: USER_UUID,
      username: 'alice',
      avatar: 'https://example.com/a.png',
      tfa: false,
    });

    const token = makeToken(USER_UUID);
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { cookie: `token=${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      username: 'alice',
      uuid: USER_UUID,
      avatar: 'https://example.com/a.png',
      tfa: false,
    });
  });
});
