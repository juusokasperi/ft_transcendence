import db from '../client.ts';
import type { GameWithPlayers, PublicUser } from '../../types/types.ts';
import type { GameDb, GamePlayerDb } from '../../types/dbtypes.ts';

function addGameHelper(team1Score: number, team2Score: number): number | null {
	try {
		const result = db.prepare(`
			INSERT INTO Games (team_1_score, team_2_score)
			VALUES (?, ?)
			`).run(team1Score, team2Score);
		return result.lastInsertRowid as number;
	} catch (error) {
		return null;
	}
};

function addGamePlayerHelper(gameId: number, uuid: string, team: number): number | null {
	try {
		const result = db.prepare(`
			INSERT INTO GamePlayers (game_id, user_uuid, team_number)
			VALUES (?, ?, ?)
			`).run(gameId, uuid, team);
		return result.lastInsertRowid as number;
	} catch (error) {
		return null;
	}
};

export function addGame(team1Score: number, team2Score: number, team1Player: string, team2Player: string): number | null;
export function addGame(team1Score: number, team2Score: number, team1Players: string[], team2Players: string[]): number | null;
export function addGame(
	team1Score: number,
	team2Score: number,
	team1: string | string[],
	team2: string | string[]
) : number | null {
	const transaction = db.transaction(() => {
		const gameId = addGameHelper(team1Score, team2Score);
		if (!gameId) throw new Error('Failed to create game');

		const team1Players = Array.isArray(team1) ? team1 : [team1];
		const team2Players = Array.isArray(team2) ? team2 : [team2];

		for (const playerId of team1Players) {
			const result = addGamePlayerHelper(gameId, playerId, 1);
			if (!result)
				throw new Error(`Failed to add team 1 player: ${playerId}`);
		}
		for (const playerId of team2Players) {
			const result = addGamePlayerHelper(gameId, playerId, 2);
			if (!result)
				throw new Error(`Failed to add team 2 player: ${playerId}`);
		}

		return gameId;
	});

	try {
		return transaction();
	} catch (error) {
		return null;
	}
};

export function getGameWithPlayers(gameId: number): GameWithPlayers | null {
	try {
		const game = db.prepare(`SELECT * FROM Games where id = ?`).get(gameId) as GameDb | null;
		if (!game)
			return null;
		const players = db.prepare(`
			SELECT
				gp.team_number,
				u.uuid,
				u.username,
				u.avatar,
				u.ranking,
				u.created_at
			FROM GamePlayers gp
			LEFT JOIN Users u on gp.user_uuid = u.uuid
			WHERE gp.game_id = ?
			ORDER BY gp.team_number, gp.id
			`).all(gameId) as GamePlayerDb[];

		const team1Players = players
			.filter(player => player.team_number === 1)
			.map(player => player.uuid ? {
				uuid: player.uuid,
				username: player.username,
				avatar: player.avatar,
				ranking: player.ranking,
				createdAt: player.created_at
			} : null) as (PublicUser | null)[];
		const team2Players = players
			.filter(player => player.team_number === 2)
			.map(player => player.uuid ? {
				uuid: player.uuid,
				username: player.username,
				avatar: player.avatar,
				ranking: player.ranking,
				createdAt: player.created_at
			} : null) as (PublicUser | null)[];

		return {
			id: game.id,
			team1Score: game.team_1_score,
			team2Score: game.team_2_score,
			players: {
				team1: team1Players,
				team2: team2Players
			},
			playedAt: game.created_at
		};
	} catch (error) {
		return null;
	}
};
