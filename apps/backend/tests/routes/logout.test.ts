import { describe, it, expect, vi } from 'vitest';

// Mock config to avoid env checks
vi.mock('../../utils/config.ts', () => ({
  SECRET: 'testsecret',
  DATABASE_PATH: ':memory:',
  JWT_ACCESS_TTL: '4h',
  JWT_REFRESH_TTL: '30d',
  JWT_2FA_TTL: '10m',
  TFA_CODE_DIGITS: 6,
  TFA_ISSUER: 'TestApp',
}));

// Mock updateLastSeen to control its return value
const { updateLastSeenMock, deleteRefreshTokensByUserMock } = vi.hoisted(() => ({
  updateLastSeenMock: vi.fn(),
  deleteRefreshTokensByUserMock: vi.fn(),
}));
vi.mock('../../db/queries/users.ts', () => ({
  updateLastSeen: updateLastSeenMock,
}));

vi.mock('../../db/queries/refreshTokens.ts', () => ({
  deleteRefreshTokensByUser: deleteRefreshTokensByUserMock,
}));

import { logoutRoutes } from '../../routes/logout.ts';

describe('logout route', () => {
  it('sends a single error response when updateLastSeen fails', async () => {
    updateLastSeenMock.mockReturnValueOnce(false);

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
    } as any;

    const req = { user: { uuid: 'u-123' } } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledTimes(1);
    expect(deleteRefreshTokensByUserMock).not.toHaveBeenCalled();
  });

  it('revokes refresh tokens and clears cookies on success', async () => {
    updateLastSeenMock.mockReturnValueOnce(true);
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
    expect(res.clearCookie).toHaveBeenCalledWith('token', { path: '/' });
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { path: '/' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith({ success: 'Successfully logged out.' });
  });
});
