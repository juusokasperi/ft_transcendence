import db from '../client';
import type { PendingUserDb } from '../../types/dbtypes';
import { addUser } from './users';

export function checkUserExists(username: string, email: string): boolean {
  const result = db
    .prepare(
      `
		SELECT 'confirmed' as source, username, email FROM Users
		WHERE username = ? or email = ?
		UNION
		SELECT 'pending' as source, username, email FROM PendingUsers
		WHERE username = ? or email = ?
		`,
    )
    .get(username, email, username, email);
  return result ? true : false;
}

export function getPendingUserByToken(token: string): PendingUserDb | undefined {
  const user = db
    .prepare(
      `
		SELECT username, email, password_hash, confirmation_token, expires_at, created_at
		FROM PendingUsers WHERE confirmation_token = ?
		`,
    )
    .get(token) as PendingUserDb | undefined;
  return user;
}

export function addUserToPending(
  username: string,
  email: string,
  passwordHash: string,
  confirmationToken: string,
): boolean {
  const result = db
    .prepare(
      `
		INSERT INTO PendingUsers (username, email, password_hash, confirmation_token, expires_at)
		VALUES (?, ?, ?, ?, datetime('now', '+24 hours'))
		`,
    )
    .run(username, email, passwordHash, confirmationToken);
  return result.changes === 1;
}

export function deleteExpiredUsers(): void {
  db.prepare(`DELETE FROM PendingUsers WHERE expires_at < datetime('now')`).run();
}

export function removeFromPending(token: string): boolean {
  const result = db.prepare(`DELETE FROM PendingUsers WHERE confirmation_token = ?`).run(token);
  return result.changes > 0;
}

export function createSettings(uuid: string): Boolean {
  const result = db
    .prepare(
      `INSERT INTO UserProfileSettings (user_uuid)
		VALUES (?)`,
    )
    .run(uuid);
  return result.changes === 1;
}

export function confirmUser(token: string, uuid: string, user: PendingUserDb): Boolean {
  const transaction = db.transaction(() => {
    if (!removeFromPending(token)) throw new Error();
    const addResult = addUser(uuid, user.username, user.password_hash, user.email);
    const settingsResult = createSettings(uuid);
    if (!addResult || !settingsResult) throw new Error();
    return true;
  });
  try {
    return transaction();
  } catch (error) {
    return false;
  }
}
