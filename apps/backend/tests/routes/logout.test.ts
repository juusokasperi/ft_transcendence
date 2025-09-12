import { describe, it, expect, vi } from 'vitest';

// Mock config to avoid env checks
vi.mock('../../utils/config.ts', () => ({
  SECRET: 'testsecret',
  DATABASE_PATH: ':memory:',
}));

// Mock updateLastSeen to control its return value
const { updateLastSeenMock } = vi.hoisted(() => ({
  updateLastSeenMock: vi.fn(),
}));
vi.mock('../../db/queries/users.ts', () => ({
  updateLastSeen: updateLastSeenMock,
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
  });
});
