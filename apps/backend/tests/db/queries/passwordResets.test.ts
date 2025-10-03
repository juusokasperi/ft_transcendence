import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb, cleanupTestDb } from '../../setup.ts';

describe('Password Reset Queries', () => {
  let testDb: Database;

  beforeEach(async () => {
    vi.resetModules();
    testDb = await createTestDb();
    vi.doMock('../../../db/client.ts', () => ({
      default: testDb,
    }));
  });

  afterEach(() => {
    cleanupTestDb(testDb);
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('purgeExpiredPasswordResetTokens should remove only expired tokens', async () => {
    const { addUser } = await import('../../../db/queries/users.ts');
    const { createResetToken, purgeExpiredPasswordResetTokens } = await import(
      '../../../db/queries/passwordResets.ts'
    );

    const expiredUser = 'uuid-reset-expired';
    const activeUser = 'uuid-reset-active';

    expect(addUser(expiredUser, 'ExpiredReset', 'hash', 'expired-reset@example.com')).toBe(true);
    expect(addUser(activeUser, 'ActiveReset', 'hash', 'active-reset@example.com')).toBe(true);

    expect(createResetToken(expiredUser, 'expired-token')).toBe(true);
    expect(createResetToken(activeUser, 'active-token')).toBe(true);

    const db = await import('../../../db/client.ts');
    db.default
      .prepare(
        "UPDATE PasswordResets SET expires_at = datetime('now', '-2 hours') WHERE reset_token = ?",
      )
      .run('expired-token');

    const removed = purgeExpiredPasswordResetTokens();
    expect(removed).toBe(1);

    const remaining = db.default
      .prepare('SELECT user_uuid, reset_token FROM PasswordResets ORDER BY user_uuid')
      .all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.user_uuid).toBe(activeUser);
    expect(remaining[0]!.reset_token).toBe('active-token');
  });

  it('findAndClearResetToken should return user and delete the token for valid entries', async () => {
    const { addUser } = await import('../../../db/queries/users.ts');
    const { createResetToken, findAndClearResetToken } = await import(
      '../../../db/queries/passwordResets.ts'
    );

    const userId = 'uuid-reset-valid';
    const resetToken = 'valid-reset-token';

    expect(addUser(userId, 'ValidReset', 'hash', 'valid-reset@example.com')).toBe(true);

    expect(createResetToken(userId, resetToken)).toBe(true);

    const uuid = findAndClearResetToken(resetToken);
    expect(uuid).toBe(userId);

    const db = await import('../../../db/client.ts');
    const count = db.default
      .prepare('SELECT COUNT(*) as count FROM PasswordResets WHERE reset_token = ?')
      .get(resetToken) as { count: number };
    expect(count.count).toBe(0);
  });

  it('clearResetTokensForId should ensure only the latest token remains for a user', async () => {
    const { addUser } = await import('../../../db/queries/users.ts');
    const { clearResetTokensForId, createResetToken } = await import(
      '../../../db/queries/passwordResets.ts'
    );

    const userId = 'uuid-reset-replace';

    expect(addUser(userId, 'ReplaceReset', 'hash', 'replace-reset@example.com')).toBe(true);

    expect(createResetToken(userId, 'initial-token')).toBe(true);
    clearResetTokensForId(userId);
    expect(createResetToken(userId, 'replacement-token')).toBe(true);

    const db = await import('../../../db/client.ts');
    const tokens = db.default
      .prepare('SELECT reset_token FROM PasswordResets WHERE user_uuid = ?')
      .all(userId) as { reset_token: string }[];

    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.reset_token).toBe('replacement-token');
  });
});
