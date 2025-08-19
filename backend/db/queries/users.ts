import db from '../client.ts';
import type { User, UserStats } from '../../types/types.ts';
import type { UserDb, UserStatsDb } from '../../types/dbtypes.ts';

export function getUserByUuid(uuid:string): User | undefined {
	const user = db.prepare('SELECT * FROM Users where uuid = ?').get(uuid) as UserDb | null;
	if (!user)
		return undefined;
	return {
		uuid: user.uuid,
		username: user.username,
		email: user.email,
		passwordHash: user.password_hash,
		tfa: user.tfa,
		avatar: user.avatar,
		ranking: user.ranking,
		createdAt: user.created_at,
		googleId: user.google_id
	};
};

export function getUserByUsername(username: string): User | undefined {
	const user = db.prepare('SELECT * FROM Users where username = ?').get(username) as UserDb | null;
	if (!user)
		return undefined;
	return {
		uuid: user.uuid,
		username: user.username,
		email: user.email,
		passwordHash: user.password_hash,
		tfa: user.tfa,
		avatar: user.avatar,
		ranking: user.ranking,
		createdAt: user.created_at,
		googleId: user.google_id
	};
}

export function deleteUser(uuid: string): boolean {
	const result = db.prepare('DELETE FROM Users WHERE uuid = ?').run(uuid);
	return result.changes === 1;
};

export function addUser(uuid: string, username: string, passwordHash: string, email: string, avatar?: string): boolean {
	try {
		const result = db.prepare(`
					INSERT INTO Users (uuid, username, password_hash, email, avatar)
					VALUES (?, ?, ?, ?, ?)
					`).run(uuid, username, passwordHash, email, avatar ? avatar : null);
		return result.changes === 1;
	} catch (error) {
		return false;
	}
};

export function updateUser(uuid: string, username?: string, avatar?: string , passwordHash?: string, deleteAvatar?: boolean): boolean {
	try {
		console.log('updateUser params:', { uuid, username, avatar, passwordHash });
		const fields: string[] = [];
		const params: any[] = [];
		if (username)
		{
			fields.push('username = ?');
			params.push(username);
		}
		if (deleteAvatar)
			fields.push('avatar = NULL');
		else if (avatar)
		{
			fields.push('avatar = ?');
			params.push(avatar);
		}
		if (passwordHash)
		{
			fields.push('password_hash = ?');
			params.push(passwordHash);
		}
		if (fields.length === 0)
			return false;

		params.push(uuid);
		const result = db.prepare(`
			UPDATE USERS
			SET ${fields.join(', ')}
			WHERE uuid = ?
			`).run(...params);

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
			u.username, u.uuid, u.avatar, u.ranking, u.created_at,
			COUNT(g.id) as total_games,
			COUNT(CASE
				WHEN (gp.team_number = 1 AND g.team_1_score > g.team_2_score)
				  OR (gp.team_number = 2 AND g.team_2_score > g.team_1_score)
				THEN 1 END) as wins,
			COUNT(CASE
				WHEN (gp.team_number = 1 AND g.team_1_score < g.team_2_score)
				  OR (gp.team_number = 2 AND g.team_2_score < g.team_1_score)
				THEN 1 END) as losses
			FROM Users u
			LEFT JOIN GamePlayers gp on u.uuid = gp.user_uuid
			LEFT JOIN Games g on gp.game_id = g.id
	`;

	// If uuid, get single user stats
	if (uuid)
	{
		const result = db.prepare(`
			${baseQuery}
			WHERE u.uuid = ?
			GROUP BY u.uuid
			`).get(uuid) as UserStatsDb | null;
		if (!result)
			return null;
		return {
			username: result.username,
			uuid: result.uuid,
			avatar: result.avatar,
			ranking: result.ranking,
			createdAt: result.created_at,
			wins: result.wins,
			losses: result.losses,
			totalGames: result.total_games
		};
	}

	// Otherwise, get all user stats
	const results = db.prepare(`
			${baseQuery}
			GROUP BY u.uuid
			ORDER BY u.ranking DESC
		`).all() as UserStatsDb[];
	if (!results || results.length === 0)
		return [];
	return results.map(dbUser => ({
		username: dbUser.username,
		uuid: dbUser.uuid,
		avatar: dbUser.avatar,
		ranking: dbUser.ranking,
		createdAt: dbUser.created_at,
		wins: dbUser.wins,
		losses: dbUser.losses,
		totalGames: dbUser.total_games
	}));
};
