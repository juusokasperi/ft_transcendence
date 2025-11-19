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

// 2) Mock the DB queries INSIDE the factory (no top-level refs!)
vi.mock('../../db/queries/users.ts', () => {
  return {
    getUserByUuid: vi.fn(), // we will grab these later from the imported module
    getUserStats: vi.fn(),
    updateUsername: vi.fn(),
    updatePassword: vi.fn(),
    updateAvatar: vi.fn(),
    getUserByUsername: vi.fn(),
    getUserByEmail: vi.fn(),
    markEmailChange: vi.fn(),
    confirmEmailChange: vi.fn(),
    getUserSettings: vi.fn(),
    updateUserSettings: vi.fn(),
  };
});

vi.mock('../../db/queries/tournamentParticipants.ts', () => ({
  updateParticipantAliasesForUser: vi.fn(),
}));

// 3) Mock nodemailer utils
vi.mock('../../utils/nodemailer/index.ts', () => ({
  sendEmailChangeEmail: vi.fn(),
}));

// 4) Now import modules that use those mocks
import * as usersQueries from '../../db/queries/users.ts';
import * as tournamentParticipantQueries from '../../db/queries/tournamentParticipants.ts';
import * as nodemailerUtils from '../../utils/nodemailer/index.ts';
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

  it('200 returns user profile with stats', async () => {
    (usersQueries.getUserByUuid as unknown as Mock).mockReturnValueOnce({
      uuid: USER_UUID,
      username: 'alice',
      avatar: 'https://example.com/a.png',
      email: 'alice@example.com',
      tfa: false,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    (usersQueries.getUserStats as unknown as Mock).mockReturnValueOnce({
      username: 'alice',
      uuid: USER_UUID,
      avatar: 'https://example.com/a.png',
      ranking: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      wins: 5,
      losses: 2,
      totalMatches: 7,
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
      email: 'alice@example.com',
      avatar: 'https://example.com/a.png',
      tfa: false,
      wins: 5,
      losses: 2,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
  });
});

describe('PATCH /api/users/me/email', () => {
  const USER_UUID = '33333333-3333-3333-3333-333333333333';
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('401 when token is missing', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me/email',
      payload: { newEmail: 'new@example.com' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('404 when user not found', async () => {
    (usersQueries.getUserByUuid as unknown as Mock).mockReturnValueOnce(null);
    const token = makeToken(USER_UUID);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me/email',
      headers: { cookie: `token=${token}` },
      payload: { newEmail: 'new@example.com' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/User not found/i);
  });

  it('400 when email already in use', async () => {
    (usersQueries.getUserByUuid as unknown as Mock).mockReturnValueOnce({
      uuid: USER_UUID,
      username: 'testuser',
      email: 'old@example.com',
    });
    (usersQueries.getUserByEmail as unknown as Mock).mockReturnValueOnce({
      uuid: 'different-uuid',
      username: 'otheruser',
    });
    const token = makeToken(USER_UUID);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me/email',
      headers: { cookie: `token=${token}` },
      payload: { newEmail: 'existing@example.com' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Email already in use/i);
  });

  it('400 when markEmailChange fails', async () => {
    (usersQueries.getUserByUuid as unknown as Mock).mockReturnValueOnce({
      uuid: USER_UUID,
      username: 'testuser',
      email: 'old@example.com',
    });
    (usersQueries.getUserByEmail as unknown as Mock).mockReturnValueOnce(null);
    (usersQueries.markEmailChange as unknown as Mock).mockReturnValueOnce(false);
    const token = makeToken(USER_UUID);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me/email',
      headers: { cookie: `token=${token}` },
      payload: { newEmail: 'new@example.com' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Failed to initiate email change/i);
  });

  it('500 when email sending fails', async () => {
    (usersQueries.getUserByUuid as unknown as Mock).mockReturnValueOnce({
      uuid: USER_UUID,
      username: 'testuser',
      email: 'old@example.com',
    });
    (usersQueries.getUserByEmail as unknown as Mock).mockReturnValueOnce(null);
    (usersQueries.markEmailChange as unknown as Mock).mockReturnValueOnce(true);
    (nodemailerUtils.sendEmailChangeEmail as unknown as Mock).mockResolvedValueOnce(false);
    const token = makeToken(USER_UUID);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me/email',
      headers: { cookie: `token=${token}` },
      payload: { newEmail: 'new@example.com' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toMatch(/Failed to send confirmation email/i);
  });

  it('200 when email change request succeeds', async () => {
    (usersQueries.getUserByUuid as unknown as Mock).mockReturnValueOnce({
      uuid: USER_UUID,
      username: 'testuser',
      email: 'old@example.com',
    });
    (usersQueries.getUserByEmail as unknown as Mock).mockReturnValueOnce(null);
    (usersQueries.markEmailChange as unknown as Mock).mockReturnValueOnce(true);
    (nodemailerUtils.sendEmailChangeEmail as unknown as Mock).mockResolvedValueOnce(true);
    const token = makeToken(USER_UUID);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me/email',
      headers: { cookie: `token=${token}` },
      payload: { newEmail: 'new@example.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toMatch(/Confirmation email sent/i);
  });
});

describe('POST /api/users/confirm-email/:token', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('400 when token is invalid', async () => {
    (usersQueries.confirmEmailChange as unknown as Mock).mockReturnValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/confirm-email/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Invalid or expired token/i);
  });

  it('200 when email confirmation succeeds', async () => {
    (usersQueries.confirmEmailChange as unknown as Mock).mockReturnValueOnce({
      uuid: 'user-uuid',
      newEmail: 'confirmed@example.com',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/confirm-email/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toMatch(/Email successfully updated/i);
  });
});

describe('PATCH /api/users/me (username)', () => {
  const USER_UUID = '44444444-4444-4444-4444-444444444444';
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('updates username and tournament aliases', async () => {
    (usersQueries.getUserStats as unknown as Mock).mockReturnValueOnce({
      uuid: USER_UUID,
      username: 'oldname',
      avatar: null,
      email: 'user@example.com',
      tfa: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      wins: 0,
      losses: 0,
    });
    (usersQueries.getUserByUsername as unknown as Mock).mockReturnValueOnce(null);
    (usersQueries.updateUsername as unknown as Mock).mockReturnValueOnce(true);
    (
      tournamentParticipantQueries.updateParticipantAliasesForUser as unknown as Mock
    ).mockReturnValueOnce(true);
    const token = makeToken(USER_UUID);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { cookie: `token=${token}` },
      payload: { newUsername: 'newname' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe('newname');
    expect(tournamentParticipantQueries.updateParticipantAliasesForUser).toHaveBeenCalledWith(
      USER_UUID,
      'newname',
    );
  });
});
