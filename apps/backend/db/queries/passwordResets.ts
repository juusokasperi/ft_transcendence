import db from '../client.ts';

export function clearResetTokensForId(uuid: string): void {
  db.prepare(`DELETE FROM PasswordResets WHERE user_uuid = ?`).run(uuid);
}

export function createResetToken(uuid: string, resetToken: string): Boolean {
  const result = db
    .prepare(
      `
		INSERT INTO PasswordResets (user_uuid, reset_token, expires_at)
		VALUES (?, ?, datetime('now', '+30 minutes'))
		`,
    )
    .run(uuid, resetToken);

  return result.changes === 1;
}

export function purgeExpiredPasswordResetTokens(): number {
  const result = db.prepare(`DELETE FROM PasswordResets WHERE expires_at < datetime('now')`).run();
  return result.changes ?? 0;
}

export function findAndClearResetToken(resetToken: string): string | undefined {
  const transaction = db.transaction(() => {
    const findResult = db
      .prepare(
        `
			SELECT user_uuid FROM PasswordResets
			WHERE reset_token = ? AND expires_at > datetime('now')
		`,
      )
      .get(resetToken) as { user_uuid: string } | undefined;
    if (!findResult || !findResult.user_uuid) throw new Error('Token not found or expired');
    const deleteResult = db
      .prepare(`DELETE FROM PasswordResets WHERE reset_token = ?`)
      .run(resetToken);
    if (deleteResult.changes === 0) throw new Error('Failed to delete token');
    return findResult.user_uuid;
  });

  try {
    return transaction();
  } catch {
    return undefined;
  }
}
