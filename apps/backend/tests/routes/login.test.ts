import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fastify from 'fastify';
import cookie from '@fastify/cookie';
import bcrypt from 'bcrypt';

vi.mock('../../utils/config.ts', () => ({
  SECRET: 'testsecret',
  DATABASE_PATH: ':memory:',
}));

const usersMock = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  updateLastSeen: vi.fn(),
}));
vi.mock('../../db/queries/users.ts', () => usersMock);

import { loginRoutes } from '../../routes/login.ts';

function parseSetCookie(headers: string[] | string | undefined, name: string) {
  const arr = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const line = arr.find((h) => h.startsWith(`${name}=`));
  if (!line) return null;
  return line.split(';')[0].split('=')[1];
}

function buildApp() {
  const app = fastify({ logger: false });
  app.register(cookie);
  app.register(loginRoutes, { prefix: '/api/login' });
  return app;
}

describe('POST /api/login', () => {
  const app = buildApp();

  beforeAll(async () => {
    usersMock.getUserByEmail.mockReturnValue({
      uuid: 'u-1',
      username: 'alice',
      passwordHash: await bcrypt.hash('StrongPass123!', 10),
      avatar: null,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('sets httpOnly token cookie and returns user info', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: 'a@a.com', password: 'StrongPass123!' },
    });

    expect(res.statusCode).toBe(200);
    const tokenCookie = parseSetCookie(res.headers['set-cookie'], 'token');
    expect(tokenCookie).toBeTruthy();
    expect(res.json()).toEqual({
      user: { username: 'alice', uuid: 'u-1', avatar: null },
    });
  });
});
