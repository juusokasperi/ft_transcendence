// tests/hooks/auth.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fastify from 'fastify';
import { signAccessToken } from '../../utils/jwt.ts';

// Mock config to control SECRET used by authPreHandler
vi.mock('../../utils/config.ts', () => ({
  SECRET: 'testsecret',
  JWT_ACCESS_TTL: '4h',
  JWT_REFRESH_TTL: '30d',
  JWT_2FA_TTL: '10m',
  TFA_CODE_DIGITS: 6,
  TFA_ISSUER: 'TestApp',
}));

import { authPreHandler } from '../../hooks/auth.ts';

function buildApp() {
  const app = fastify({ logger: false });
  app.get('/secure', { preHandler: authPreHandler }, async (req) => ({ user: req.user }));
  return app;
}

describe('authPreHandler', () => {
  const app = buildApp();
  const token = signAccessToken({ uuid: 'u-123', username: 'tester' });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts lowercase bearer authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: `bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { uuid: 'u-123' } });
  });

  it('accepts uppercase bearer authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: `BEARER ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { uuid: 'u-123' } });
  });
  it('rejects missing authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ message: 'Missing or invalid token' });
  });

  it('rejects malformed authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'InvalidHeader' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ message: 'Missing or invalid token' });
  });

  it('rejects invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer invalidtoken' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ message: 'Invalid or expired token' });
  });
});
