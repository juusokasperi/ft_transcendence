import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fastify from 'fastify';
import cookie from '@fastify/cookie';
import { createHash } from 'crypto';

vi.mock('../../utils/config.ts', () => ({
  SECRET: 'testsecret',
  DATABASE_PATH: ':memory:',
  JWT_ACCESS_TTL: '4h',
  JWT_REFRESH_TTL: '30d',
  JWT_2FA_TTL: '10m',
  TFA_CODE_DIGITS: 6,
  TFA_ISSUER: 'TestApp',
}));

const mocks = vi.hoisted(() => ({
  getRefreshToken: vi.fn(),
  deleteRefreshToken: vi.fn(),
  storeRefreshToken: vi.fn(),
  deleteRefreshTokensByUser: vi.fn(),
  purgeExpiredRefreshTokens: vi.fn(),
  issueTokensForUser: vi.fn(),
}));

vi.mock('../../db/queries/refreshTokens.ts', () => ({
  hashRefreshToken: (token: string) => createHash('sha256').update(token).digest('hex'),
  getRefreshToken: mocks.getRefreshToken,
  deleteRefreshToken: mocks.deleteRefreshToken,
  storeRefreshToken: mocks.storeRefreshToken,
  deleteRefreshTokensByUser: mocks.deleteRefreshTokensByUser,
  purgeExpiredRefreshTokens: mocks.purgeExpiredRefreshTokens,
}));

vi.mock('../../utils/authTokens.ts', () => ({
  issueTokensForUser: mocks.issueTokensForUser,
}));

import { refreshRoutes } from '../../routes/refresh.ts';
import { signRefreshToken } from '../../utils/jwt.ts';

function parseCookie(headers: string[] | string | undefined, name: string) {
  const arr = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const entry = arr.find((line) => line.startsWith(`${name}=`));
  if (!entry) return null;
  return entry.split(';')[0].split('=')[1];
}

function buildApp() {
  const app = fastify({ logger: false });
  app.register(cookie);
  app.register(refreshRoutes, { prefix: '/api/auth' });
  return app;
}

describe('POST /api/auth/refresh', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rotates refresh token and returns new cookies', async () => {
    const payload = { uuid: 'user-1', username: 'alice', tokenId: 'token-123' };
    const refreshToken = signRefreshToken(payload);
    const hashed = createHash('sha256').update(refreshToken).digest('hex');

    mocks.getRefreshToken.mockReturnValue({
      token_id: payload.tokenId,
      user_uuid: payload.uuid,
      hashed_token: hashed,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: new Date().toISOString(),
    });

    mocks.issueTokensForUser.mockReturnValue({
      accessToken: 'newAccess',
      refreshToken: 'newRefresh',
      refreshCookieMaxAge: 1234,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refresh_token: refreshToken },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });
    expect(mocks.deleteRefreshToken).toHaveBeenCalledWith(payload.tokenId);
    expect(mocks.issueTokensForUser).toHaveBeenCalledWith({ uuid: payload.uuid, username: payload.username });
    const tokenCookie = parseCookie(res.headers['set-cookie'], 'token');
    const refreshCookie = parseCookie(res.headers['set-cookie'], 'refresh_token');
    expect(tokenCookie).toBe('newAccess');
    expect(refreshCookie).toBe('newRefresh');
  });

  it('returns 401 when refresh token expired', async () => {
    const payload = { uuid: 'user-2', username: 'bob', tokenId: 'token-456' };
    const refreshToken = signRefreshToken(payload);
    const hashed = createHash('sha256').update(refreshToken).digest('hex');

    mocks.getRefreshToken.mockReturnValue({
      token_id: payload.tokenId,
      user_uuid: payload.uuid,
      hashed_token: hashed,
      expires_at: new Date(Date.now() - 1_000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refresh_token: refreshToken },
    });

    expect(res.statusCode).toBe(401);
    expect(mocks.deleteRefreshToken).toHaveBeenCalledWith(payload.tokenId);
    expect(parseCookie(res.headers['set-cookie'], 'token')).toBe('');
    expect(parseCookie(res.headers['set-cookie'], 'refresh_token')).toBe('');
  });

  it('returns 401 when stored hash mismatches', async () => {
    const payload = { uuid: 'user-3', username: 'cara', tokenId: 'token-789' };
    const refreshToken = signRefreshToken(payload);

    mocks.getRefreshToken.mockReturnValue({
      token_id: payload.tokenId,
      user_uuid: payload.uuid,
      hashed_token: 'different-hash',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refresh_token: refreshToken },
    });

    expect(res.statusCode).toBe(401);
    expect(mocks.deleteRefreshToken).toHaveBeenCalledWith(payload.tokenId);
  });

  it('returns 401 when cookie missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(mocks.getRefreshToken).not.toHaveBeenCalled();
  });
});
