import crypto from 'crypto';
import db from '../client.ts';
import type { RefreshTokenDb } from '../../types/dbtypes.ts';

const insertRefreshTokenStmt = db.prepare(`
  INSERT INTO RefreshTokens (token_id, user_uuid, hashed_token, expires_at)
  VALUES (?, ?, ?, ?)
`);

const getRefreshTokenStmt = db.prepare(
  `SELECT token_id, user_uuid, hashed_token, expires_at, created_at FROM RefreshTokens WHERE token_id = ?`,
);

const deleteRefreshTokenStmt = db.prepare(`
  DELETE FROM RefreshTokens WHERE token_id = ?
`);

const deleteByUserStmt = db.prepare(`
  DELETE FROM RefreshTokens WHERE user_uuid = ?
`);

const purgeExpiredStmt = db.prepare(`
  DELETE FROM RefreshTokens WHERE expires_at <= ?
`);

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function storeRefreshToken(options: {
  tokenId: string;
  userUuid: string;
  hashedToken: string;
  expiresAt: string;
}): boolean {
  const { tokenId, userUuid, hashedToken, expiresAt } = options;
  try {
    const result = insertRefreshTokenStmt.run(tokenId, userUuid, hashedToken, expiresAt);
    return result.changes === 1;
  } catch {
    return false;
  }
}

export function getRefreshToken(tokenId: string): RefreshTokenDb | undefined {
  const row = getRefreshTokenStmt.get(tokenId) as RefreshTokenDb | undefined;
  return row;
}

export function deleteRefreshToken(tokenId: string): boolean {
  const result = deleteRefreshTokenStmt.run(tokenId);
  return result.changes > 0;
}

export function deleteRefreshTokensByUser(userUuid: string): number {
  const result = deleteByUserStmt.run(userUuid);
  return result.changes ?? 0;
}

export function purgeExpiredRefreshTokens(nowIso: string): number {
  const result = purgeExpiredStmt.run(nowIso);
  return result.changes ?? 0;
}
