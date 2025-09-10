import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../index';
import * as users from '../../db/queries/users';

function parseSetCookie(headers: string[] | string | undefined, name: string) {
  const arr = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const line = arr.find((h) => h.startsWith(`${name}=`));
  if (!line) return null;
  return line.split(';')[0].split('=')[1];
}

describe('Google OAuth flow', () => {
  const app = buildApp();

  // Mocks for DB
  const user = {
    uuid: 'u-123',
    username: 'john',
    email: 'john@example.com',
    avatar: 'https://pics.example/avatar.png',
    googleId: 'sub-123',
  };

  beforeAll(async () => {
    // Mock DB layer
    vi.spyOn(users, 'getUserByGoogleId').mockImplementation((sub: string) => {
      return sub === 'sub-123' ? ({ ...user }) as any : null;
    });
    vi.spyOn(users, 'createUserFromGoogle').mockImplementation((p: any) => {
      // simulate creating user on first-time google login
      return { ...user, username: p.name, email: p.email, avatar: p.picture } as any;
    });
    vi.spyOn(users, 'getUserByEmail').mockReturnValue(null as any);
    vi.spyOn(users, 'linkGoogleToUser').mockReturnValue(true as any);
    vi.spyOn(users, 'updateGoogleUser').mockReturnValue(true as any);

    // Mock Google endpoints via fetch
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const u = typeof url === 'string' ? url : url.toString();

      // token exchange
      if (u.startsWith('https://oauth2.googleapis.com/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock_access',
            id_token: 'mock_id',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // userinfo
      if (u.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: 'sub-123',
            email: 'john@example.com',
            name: 'John',
            picture: 'https://pics.example/avatar.png',
            email_verified: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('not found', { status: 404 });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('redirects to Google and sets state cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/google',
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(res.headers['set-cookie']).toBeTruthy();

    const stateCookie = parseSetCookie(res.headers['set-cookie'], 'oauth_state');
    expect(stateCookie).toBeTruthy();
  });

  it('handles callback, creates/links user, sets token cookie, redirects /', async () => {
    // First, hit /api/auth/google to get a real state cookie we can reuse
    const step1 = await app.inject({ method: 'GET', url: '/api/auth/google' });
    const state = parseSetCookie(step1.headers['set-cookie'], 'oauth_state');

    // Now call callback with the same state + a fake code
    const step2 = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=fake_code&state=${state}`,
      headers: {
        cookie: `oauth_state=${state}`,
      },
    });

    // should redirect to SPA root
    expect(step2.statusCode).toBe(302);
    expect(step2.headers.location).toBe('/');

    // token cookie should be set by your route
    const tokenCookie = parseSetCookie(step2.headers['set-cookie'], 'token');
    expect(tokenCookie).toBeTruthy();
  });

  it('rejects on state mismatch', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=fake_code&state=WRONG_STATE`,
      headers: {
        cookie: `oauth_state=SOME_OTHER_STATE`,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_state');
  });
});