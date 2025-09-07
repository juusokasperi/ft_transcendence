import db from '../client.ts';
import type { User, UserStats, UserSettings } from '../../types/types.ts';
import type { UserDb, UserStatsDb, UserSettingsDb } from '../../types/dbtypes.ts';

export function getUserByUuid(uuid: string): User | undefined {
  const user = db.prepare('SELECT * FROM Users where uuid = ?').get(uuid) as UserDb | null;
  if (!user) return undefined;
  return {
    uuid: user.uuid,
    username: user.username,
    email: user.email,
    passwordHash: user.password_hash,
    tfa: user.tfa,
    avatar: user.avatar,
    ranking: user.ranking,
    createdAt: user.created_at,
    googleId: user.google_id,
  };
}

export function getUserByUsernameOrEmail(username: string, email: string): User | undefined {
  const user = db
    .prepare('SELECT * FROM Users where username = ? OR email = ?')
    .get(username, email) as UserDb | null;
  if (!user) return undefined;
  return {
    uuid: user.uuid,
    username: user.username,
    email: user.email,
    passwordHash: user.password_hash,
    tfa: user.tfa,
    avatar: user.avatar,
    ranking: user.ranking,
    createdAt: user.created_at,
    googleId: user.google_id,
  };
}

export function getUserByUsername(username: string): User | undefined {
  const user = db.prepare('SELECT * FROM Users where username = ?').get(username) as UserDb | null;
  if (!user) return undefined;
  return {
    uuid: user.uuid,
    username: user.username,
    email: user.email,
    passwordHash: user.password_hash,
    tfa: user.tfa,
    avatar: user.avatar,
    ranking: user.ranking,
    createdAt: user.created_at,
    googleId: user.google_id,
  };
}

export function getUserByEmail(email: string): User | undefined {
  const user = db.prepare('SELECT * FROM Users WHERE email = ?').get(email) as UserDb | null;
  if (!user) return undefined;
  return {
    uuid: user.uuid,
    username: user.username,
    email: user.email,
    passwordHash: user.password_hash,
    tfa: user.tfa,
    avatar: user.avatar,
    ranking: user.ranking,
    createdAt: user.created_at,
    googleId: user.google_id,
  };
}

export function getUser(identifier: string): User | undefined {
  const user = db
    .prepare(
      `SELECT * FROM Users WHERE uuid = ? OR username = ? OR email = ?
		`,
    )
    .get(identifier, identifier, identifier) as UserDb | null;
  if (!user) return undefined;
  return {
    uuid: user.uuid,
    username: user.username,
    email: user.email,
    passwordHash: user.password_hash,
    tfa: user.tfa,
    avatar: user.avatar,
    ranking: user.ranking,
    createdAt: user.created_at,
    googleId: user.google_id,
  };
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
					INSERT INTO Users (uuid, username, password_hash, email, avatar)
					VALUES (?, ?, ?, ?, ?)
					`,
      )
      .run(uuid, username, passwordHash, email, avatar ? avatar : null);
    return result.changes === 1;
  } catch (error) {
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

export function getUserStats(): UserStats[];
export function getUserStats(uuid: string): UserStats | null;
export function getUserStats(uuid?: string): UserStats[] | UserStats | null {
  const baseQuery = `
		SELECT
			u.username, u.uuid, u.email, u.avatar, u.ranking, u.created_at, u.last_seen,
			COUNT(g.id) as total_games,
			COUNT(CASE
				WHEN (gp.team_number = 1 AND g.team_1_score > g.team_2_score)
				  OR (gp.team_number = 2 AND g.team_2_score > g.team_1_score)
				THEN 1 END) as wins,
			COUNT(CASE
				WHEN (gp.team_number = 1 AND g.team_1_score < g.team_2_score)
				  OR (gp.team_number = 2 AND g.team_2_score < g.team_1_score)
				THEN 1 END) as losses,
			CASE
				WHEN u.last_seen >= datetime('now', '-5 minutes') THEN 1
				ELSE 0
			END as online
			FROM Users u
			LEFT JOIN GamePlayers gp on u.uuid = gp.user_uuid
			LEFT JOIN Games g on gp.game_id = g.id
	`;

  // If uuid, get single user stats
  if (uuid) {
    const result = db
      .prepare(
        `
			${baseQuery}
			WHERE u.uuid = ?
			GROUP BY u.uuid
			`,
      )
      .get(uuid) as UserStatsDb || null;
    if (!result) return null;
    return {
      username: result.username,
      uuid: result.uuid,
      avatar: result.avatar,
      ranking: result.ranking,
      createdAt: result.created_at,
      wins: result.wins,
      losses: result.losses,
      totalGames: result.total_games,
			online: !!result.online,
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
    totalGames: dbUser.total_games,
		online: !!dbUser.online,
  })) as UserStats[];
}

export function updateLastSeen(uuid: string, date?: Date): Boolean {
	const timestamp = date || new Date();
	const dateSqliteFormat = timestamp.toISOString().slice(0, 19).replace('T', ' ');
	const result = db.prepare(`
		UPDATE Users
		SET last_seen = ?
		WHERE uuid = ?
		`).run(dateSqliteFormat, uuid);
	return result.changes === 1;
};

export function getUserSettings(uuid: string): UserSettings | null {
	const result = db.prepare(`
		SELECT * FROM UserProfileSettings
		WHERE user_uuid = ?`).get(uuid) as UserSettingsDb | null;
	if (!result)
		return null;
	return {
		uuid: result.user_uuid,
		paddleColor: result.paddle_color,
		colorBlindMode: result.color_blind_mode,
		photoSensitiveMode: result.photo_sensitive_mode
	};
};

export function updateUserSettings(uuid: string, settings: Partial<Omit<UserSettingsDb, 'user_uuid'>>): boolean {
	const fields: string[] = [];
	const values: any[] = [];
	for (const [key, value] of Object.entries(settings)) {
		fields.push(`${key} = ?`);
		values.push(value);
	}
	if (fields.length === 0)
		return false;
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
};
