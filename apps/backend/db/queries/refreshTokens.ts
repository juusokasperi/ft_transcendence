import crypto from 'crypto';
import type { Statement } from 'better-sqlite3';
import db from '../client.ts';
import type { RefreshTokenDb } from '../../types/dbtypes.ts';

let prepared = false;
let insertRefreshTokenStmt: Statement<[string, string, string, string]>;
let getRefreshTokenStmt: Statement<[string], RefreshTokenDb>;
let deleteRefreshTokenStmt: Statement<[string]>;
let deleteByUserStmt: Statement<[string]>;
let purgeExpiredStmt: Statement<[string]>;

function ensurePrepared() {
  if (prepared) return;
  insertRefreshTokenStmt = db.prepare<[string, string, string, string]>(
    `INSERT INTO RefreshTokens (token_id, user_uuid, hashed_token, expires_at) VALUES (?, ?, ?, ?)`,
  );
  getRefreshTokenStmt = db.prepare<[string], RefreshTokenDb>(
    `SELECT token_id, user_uuid, hashed_token, expires_at, created_at FROM RefreshTokens WHERE token_id = ?`,
  );
  deleteRefreshTokenStmt = db.prepare<[string]>(`DELETE FROM RefreshTokens WHERE token_id = ?`);
  deleteByUserStmt = db.prepare<[string]>(`DELETE FROM RefreshTokens WHERE user_uuid = ?`);
  purgeExpiredStmt = db.prepare<[string]>(`DELETE FROM RefreshTokens WHERE expires_at <= ?`);
  prepared = true;
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function storeRefreshToken(options: {
  tokenId: string;
  userUuid: string;
  hashedToken: string;
  expiresAt: string;
}): boolean {
  ensurePrepared();
  const { tokenId, userUuid, hashedToken, expiresAt } = options;
  try {
    const result = insertRefreshTokenStmt.run(tokenId, userUuid, hashedToken, expiresAt);
    return result.changes === 1;
  } catch {
    return false;
  }
}

export function getRefreshToken(tokenId: string): RefreshTokenDb | undefined {
  ensurePrepared();
  const row = getRefreshTokenStmt.get(tokenId) as RefreshTokenDb | undefined;
  return row;
}

export function deleteRefreshToken(tokenId: string): boolean {
  ensurePrepared();
  const result = deleteRefreshTokenStmt.run(tokenId);
  return result.changes > 0;
}

export function deleteRefreshTokensByUser(userUuid: string): number {
  ensurePrepared();
  const result = deleteByUserStmt.run(userUuid);
  return result.changes ?? 0;
}

export function purgeExpiredRefreshTokens(nowIso: string): number {
  ensurePrepared();
  const result = purgeExpiredStmt.run(nowIso);
  return result.changes ?? 0;
}
