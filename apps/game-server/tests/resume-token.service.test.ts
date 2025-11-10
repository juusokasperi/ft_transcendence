import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResumeTokenService } from '../src/app/ResumeTokenService.ts';
import { signResumeToken } from '@pong/shared/auth/tokenSign';

function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string, _mode: string, _ttl: number, flag: string) => {
      if (flag === 'NX' && store.has(key)) return null;
      store.set(key, value);
      return 'OK' as const;
    }),
    del: vi.fn(async (key: string) => {
      return store.delete(key) ? 1 : 0;
    }),
  } as any;
}

const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as any;

describe('ResumeTokenService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('issues and consumes token once', async () => {
    const redis = createFakeRedis();
    const svc = new ResumeTokenService({ redis, logger: fakeLogger });
    const { resumeToken, claims } = await svc.issue({
      roomIdentifier: 'r1',
      playerIdentifier: 'p1',
      sessionIdentifier: 's1',
      ttlMs: 5000,
    });

    const first = await svc.consume(resumeToken);
    expect(first?.jti).toEqual(claims.jti);
    const second = await svc.consume(resumeToken);
    expect(second).toBeNull();
  });

  it('throws when redis set fails', async () => {
    const redis = createFakeRedis();
    // Pre-populate same key to force NX failure.
    const svc1 = new ResumeTokenService({ redis, logger: fakeLogger });
    const issued = await svc1.issue({
      roomIdentifier: 'r2',
      playerIdentifier: 'p2',
      sessionIdentifier: 's2',
      ttlMs: 1000,
    });
    // Construct another service to issue again but with mocked same jti by stubbing uuid is harder;
    // Simulate NX failure by directly setting the key prior to issue.
    // For simplicity here, we duplicate by attempting to set the same key again via store presence.
    const svc2 = new ResumeTokenService({ redis, logger: fakeLogger });
    // Consume to clear first to not affect NX; then re-create conflict by setting store directly
    await svc1.consume(issued.resumeToken);
    // Force set to return null for NX by overriding redis.set
    (redis.set as any).mockResolvedValueOnce(null);
    await expect(
      svc2.issue({
        roomIdentifier: 'r2',
        playerIdentifier: 'p2',
        sessionIdentifier: 's2',
        ttlMs: 1000,
      }),
    ).rejects.toThrowError();
  });

  it('rejects tokens with invalid iss/aud', async () => {
    const redis = createFakeRedis();
    const svc = new ResumeTokenService({ redis, logger: fakeLogger });
    const badToken = signResumeToken({
      iss: 'other',
      aud: 'bad',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 10,
      jti: 'x',
      roomIdentifier: 'r3',
      sub: 'p3',
      sessionIdentifier: 's3',
    });
    const result = await svc.consume(badToken);
    expect(result).toBeNull();
  });
});
