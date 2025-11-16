import { describe, it, expect, vi } from 'vitest';

const { ACCESS_COOKIE, REFRESH_COOKIE } = vi.hoisted(() => ({
  ACCESS_COOKIE: 'accessTokenCookie',
  REFRESH_COOKIE: 'refreshTokenCookie',
}));

// Mock config to avoid env checks
vi.mock('../../utils/config.ts', () => ({
  SECRET: 'testsecret',
  REFRESH_SECRET: 'refreshsecret',
  DATABASE_PATH: ':memory:',
  JWT_ACCESS_TTL: '4h',
  JWT_REFRESH_TTL: '30d',
  JWT_2FA_TTL: '10m',
  TFA_CODE_DIGITS: 6,
  TFA_ISSUER: 'TestApp',
  ACCESS_TOKEN_COOKIE_NAME: ACCESS_COOKIE,
  REFRESH_TOKEN_COOKIE_NAME: REFRESH_COOKIE,
}));

const { deleteRefreshTokensByUserMock } = vi.hoisted(() => ({
  deleteRefreshTokensByUserMock: vi.fn(),
}));

vi.mock('../../db/queries/refreshTokens.ts', () => ({
  deleteRefreshTokensByUser: deleteRefreshTokensByUserMock,
}));

import { logoutRoutes } from '../../routes/logout.ts';

describe('logout route', () => {
  it('revokes refresh tokens and clears cookies on success', async () => {
    deleteRefreshTokensByUserMock.mockReturnValueOnce(1);

    let handler: any;
    const app: any = {
      post: (_path: string, _opts: any, h: any) => {
        handler = h;
      },
    };

    await logoutRoutes(app);

    const send = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      send,
      clearCookie: vi.fn(),
    } as any;

    const req = { user: { uuid: 'u-456' } } as any;

    await handler(req, res);

    expect(deleteRefreshTokensByUserMock).toHaveBeenCalledWith('u-456');
    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_COOKIE, { path: '/' });
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, { path: '/' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith({ success: 'Successfully logged out.' });
  });
});
