import db from '../client.ts';
import type { UserStats } from '@utils/types';
import type { User, UserSettings } from '../../types/types.ts';
import type { UserDb, UserStatsDb, UserSettingsDb } from '../../types/dbtypes.ts';
import crypto from 'crypto';

function mapUserRecord(user: UserDb): User {
  return {
    uuid: user.uuid,
    username: user.username,
    email: user.email,
    passwordHash: user.password_hash,
    tfa: !!user.tfa,
    tfaSecret: user.tfa_secret,
    avatar: user.avatar,
    ranking: user.ranking,
    createdAt: user.created_at,
    googleId: user.google_id,
  };
}

export function getUserByUuid(uuid: string): User | undefined {
  const user = db.prepare('SELECT * FROM Users where uuid = ?').get(uuid) as UserDb | null;
  if (!user) return undefined;
  return mapUserRecord(user);
}

export function getUserByUsernameOrEmail(username: string, email: string): User | undefined {
  const user = db
    .prepare('SELECT * FROM Users where username = ? OR email = ?')
    .get(username, email) as UserDb | null;
  if (!user) return undefined;
  return mapUserRecord(user);
}

export function getUserByUsername(username: string): User | undefined {
  const user = db.prepare('SELECT * FROM Users where username = ?').get(username) as UserDb | null;
  if (!user) return undefined;
  return mapUserRecord(user);
}

export function getUserByEmail(email: string): User | undefined {
  const user = db.prepare('SELECT * FROM Users WHERE email = ?').get(email) as UserDb | null;
  if (!user) return undefined;
  return mapUserRecord(user);
}

export function getUserByGoogleId(googleId: string): User | undefined {
  const user = db.prepare('SELECT * FROM Users WHERE google_id = ?').get(googleId) as UserDb | null;
  if (!user) return undefined;
  return mapUserRecord(user);
}

export function getUser(identifier: string): User | undefined {
  const user = db
    .prepare(`SELECT * FROM Users WHERE uuid = ? OR username = ? OR email = ?`)
    .get(identifier, identifier, identifier) as UserDb | null;
  if (!user) return undefined;
  return mapUserRecord(user);
}

export function addUser(
  uuid: string,
  username: string,
  passwordHash: string,
  email: string,
  avatar?: string,
): boolean {
  try {
    const result = db
      .prepare(
        `
					INSERT INTO Users (uuid, username, password_hash, email, avatar, ranking)
					VALUES (?, ?, ?, ?, ?, 1000)
					`,
      )
      .run(uuid, username, passwordHash, email, avatar ? avatar : null);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

// check it later
function ensureUniqueUsername(preferred: string): string {
  const base =
    (preferred || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'user';
  let candidate = base;
  let n = 0;
  while (db.prepare('SELECT 1 FROM Users WHERE username = ?').get(candidate)) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
}

export function createUserFromGoogle(profile: {
  googleId: string;
  email?: string | undefined;
  name?: string | undefined;
  picture?: string | undefined;
}): User | undefined {
  try {
    const uuid = crypto.randomUUID();
    const username = ensureUniqueUsername(profile.name ?? profile.email?.split('@')[0] ?? 'user');
    db.prepare(
      `INSERT INTO Users (uuid, username, email, avatar, google_id, ranking)
       VALUES (?, ?, ?, ?, ?, 1000)`,
    ).run(uuid, username, profile.email ?? null, profile.picture ?? null, profile.googleId);
    return getUser(uuid);
  } catch {
    return undefined;
  }
}

// Update existing Google user on each login (soft-sync)
export function updateGoogleUser(profile: {
  googleId: string;
  email?: string | undefined; // Google OIDC email (usually verified)
  name?: string | undefined; // Google 'name'
  picture?: string | undefined; // Google 'picture' (URL)
}): boolean {
  try {
    // Soft policy:
    // - username: only fill if empty/NULL
    // - avatar:   only fill if empty/NULL
    // - email:    only fill if empty/NULL (to avoid UNIQUE collisions / overriding user change)
    const res = db
      .prepare(
        `
      UPDATE Users
      SET
        username  = CASE WHEN (username IS NULL OR username = '')
                         THEN COALESCE(?, username)
                         ELSE username END,
        avatar    = CASE WHEN (avatar   IS NULL OR avatar   = '')
                         THEN COALESCE(?, avatar)
                         ELSE avatar   END,
        email     = CASE WHEN (email    IS NULL OR email    = '')
                         THEN COALESCE(?, email)
                         ELSE email    END
      WHERE google_id = ?
    `,
      )
      .run(profile.name ?? null, profile.picture ?? null, profile.email ?? null, profile.googleId);
    return res.changes === 1;
  } catch {
    return false;
  }
}

// Link Google account to existing user (no overwrite if already linked)
export function linkGoogleToUser(uuid: string, googleId: string, picture?: string): boolean {
  try {
    const res = db
      .prepare(
        `
      UPDATE Users
      SET
        google_id = ?,
        -- backfill ONLY avatar if it's empty
        avatar = CASE
          WHEN (avatar IS NULL OR avatar = '')
            THEN COALESCE(?, avatar)
          ELSE avatar
        END
      WHERE uuid = ? AND google_id IS NULL
    `,
      )
      .run(googleId, picture ?? null, uuid);

    return res.changes === 1;
  } catch {
    return false;
  }
}

// Update or delete avatar (if no avatarPath; then delete)
export function updateAvatar(uuid: string, avatarPath?: string): boolean {
  try {
    let avatar;
    if (!avatarPath) avatar = null;
    else avatar = avatarPath;
    const result = db
      .prepare(
        `
			UPDATE Users
			SET avatar = ?
			WHERE uuid = ?`,
      )
      .run(avatar, uuid);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

// Change password
export function updatePassword(uuid: string, passwordHash: string): boolean {
  try {
    const result = db
      .prepare(
        `
			UPDATE Users
			SET password_hash = ?
			WHERE uuid = ?`,
      )
      .run(passwordHash, uuid);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

export function updateUsername(uuid: string, username: string): boolean {
  try {
    const result = db
      .prepare(
        `
			UPDATE Users
			SET username = ?
			WHERE uuid = ?
			`,
      )
      .run(username, uuid);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

export function updateEmail(uuid: string, email: string): boolean {
  try {
    const result = db
      .prepare(
        `
			UPDATE Users
			SET email = ?
			WHERE uuid = ?
			`,
      )
      .run(email, uuid);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

export function purgeExpiredEmailChangeRequests(): number {
  const result = db
    .prepare(`DELETE FROM EmailChangeRequests WHERE email_change_expires <= datetime('now')`)
    .run();
  return result.changes ?? 0;
}

export function markEmailChange(uuid: string, newEmail: string, token: string): boolean {
  const transaction = db.transaction(() => {
    purgeExpiredEmailChangeRequests();
    db.prepare(`DELETE FROM EmailChangeRequests WHERE user_uuid = ?`).run(uuid);
    db.prepare(
      `
			INSERT INTO EmailChangeRequests (email_change_token, user_uuid, email_change_new_email, email_change_expires)
			VALUES (?, ?, ?, datetime('now', '+24 hours'))
		`,
    ).run(token, uuid, newEmail);
  });

  try {
    transaction();
    return true;
  } catch (error) {
    return false;
  }
}

export function confirmEmailChange(token: string): { uuid: string; newEmail: string } | null {
  const transaction = db.transaction(() => {
    const request = db
      .prepare(
        `
			SELECT user_uuid, email_change_new_email as new_email
			FROM EmailChangeRequests
			WHERE email_change_token = ? AND email_change_expires > datetime('now')
		`,
      )
      .get(token) as { user_uuid: string; new_email: string } | undefined;

    if (!request) throw new Error('Invalid or expired token');

    const updateResult = db
      .prepare(
        `
			UPDATE Users
			SET email = ?
			WHERE uuid = ?
		`,
      )
      .run(request.new_email, request.user_uuid);

    if (updateResult.changes === 0) throw new Error('Update failed');

    db.prepare(`DELETE FROM EmailChangeRequests WHERE email_change_token = ?`).run(token);

    return { uuid: request.user_uuid, newEmail: request.new_email };
  });

  try {
    return transaction();
  } catch {
    return null;
  }
}

export function getUserStats(): UserStats[];
export function getUserStats(uuid: string): UserStats | null;
export function getUserStats(uuid?: string): UserStats[] | UserStats | null {
  const baseQuery = `
		SELECT
			u.username, u.uuid, u.avatar, u.ranking, u.created_at,
			COUNT(m.id) as total_matches,
			COUNT(CASE
				WHEN (mp.team_number = 1 AND m.team_1_score > m.team_2_score)
				  OR (mp.team_number = 2 AND m.team_2_score > m.team_1_score)
				THEN 1 END) as wins,
			COUNT(CASE
				WHEN (mp.team_number = 1 AND m.team_1_score < m.team_2_score)
				  OR (mp.team_number = 2 AND m.team_2_score < m.team_1_score)
				THEN 1 END) as losses
			FROM Users u
			LEFT JOIN MatchPlayers mp on u.uuid = mp.user_uuid
			LEFT JOIN Matches m on mp.match_id = m.id
	`;

  // If uuid, get single user stats
  if (uuid) {
    const result =
      (db
        .prepare(
          `
			${baseQuery}
			WHERE u.uuid = ? OR u.username = ?
			GROUP BY u.uuid
			`,
        )
        .get(uuid, uuid) as UserStatsDb) || null;
    if (!result) return null;
    return {
      username: result.username,
      uuid: result.uuid,
      avatar: result.avatar,
      ranking: result.ranking,
      createdAt: result.created_at,
      wins: result.wins,
      losses: result.losses,
      totalMatches: result.total_matches,
    } as UserStats;
  }

  // Otherwise, get all user stats
  const results = db
    .prepare(
      `
			${baseQuery}
			GROUP BY u.uuid
			ORDER BY u.ranking DESC
		`,
    )
    .all() as UserStatsDb[];
  if (!results || results.length === 0) return [];
  return results.map((dbUser) => ({
    username: dbUser.username,
    uuid: dbUser.uuid,
    avatar: dbUser.avatar,
    ranking: dbUser.ranking,
    createdAt: dbUser.created_at,
    wins: dbUser.wins,
    losses: dbUser.losses,
    totalMatches: dbUser.total_matches,
  })) as UserStats[];
}

export function getUserSettings(uuid: string): UserSettings | null {
  const result = db
    .prepare(
      `
		SELECT * FROM UserProfileSettings
		WHERE user_uuid = ?`,
    )
    .get(uuid) as UserSettingsDb | null;
  if (!result) return null;
  return {
    uuid: result.user_uuid,
    paddleColor: result.paddle_color,
    colorBlindMode: result.color_blind_mode,
    photoSensitiveMode: result.photo_sensitive_mode,
  };
}

export function updateUserSettings(
  uuid: string,
  settings: Partial<Omit<UserSettingsDb, 'user_uuid'>>,
): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(settings)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return false;
  values.push(uuid);
  const sqlQuery = `
		UPDATE UserProfileSettings
		SET ${fields.join(', ')}
		WHERE user_uuid = ?`;
  try {
    const result = db.prepare(sqlQuery).run(...values);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

export function updateUserRanking(uuid: string, newRanking: number): Boolean {
  const res = db
    .prepare(
      `
    UPDATE Users
    SET ranking = ?
    WHERE uuid = ?
    `,
    )
    .run(newRanking, uuid);
  return res.changes === 1;
}
