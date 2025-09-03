import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, cleanupTestDb } from './setup.ts';
import type { Database } from 'better-sqlite3';

describe('Game Functions', () => {
	let testDb: Database;

	beforeEach(async () => {
		vi.resetModules();
		testDb = await createTestDb();
		vi.doMock('../db/client.ts', () => ({
			default: testDb
		}));
	});

	afterEach(() => {
		cleanupTestDb(testDb);
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('Create 1v1 game', async () => {
		const { addGame, getGameWithPlayers } = await import('../db/queries/games.ts');
		const { addUser } = await import('../db/queries/users.ts');
		const player1Id = 'uuid-1';
		const player2Id = 'uuid-2';
		addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
		addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');

		const gameId = addGame(21, 15, player1Id, player2Id);
		expect(gameId).toBeTruthy();
		expect(typeof(gameId)).toBe('number');

		const game = getGameWithPlayers(gameId!);
		expect(game).toBeTruthy();
		expect(game!.team1Score).toBe(21);
		expect(game!.team2Score).toBe(15);
		expect(game!.players.team1).toHaveLength(1);
		expect(game!.players.team2).toHaveLength(1);
		expect(game!.players.team1[0]!.username).toBe('Joe');
		expect(game!.players.team2[0]!.username).toBe('Bob');
	});

	it('Create 2v2 game', async () => {
		const { addGame, getGameWithPlayers } = await import('../db/queries/games.ts');
		const { addUser } = await import('../db/queries/users.ts');
		const player1Id = 'uuid-1';
		const player2Id = 'uuid-2';
		const player3Id = 'uuid-3';
		const player4Id = 'uuid-4';
		addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
		addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');
		addUser(player3Id, 'Alice', 'hashPass', 'test2@mail.com');
		addUser(player4Id, 'Elizabeth', 'hashPass', 'test3@mail.com');

		const team1 = [player1Id, player2Id];
		const team2 = [player3Id, player4Id];

		const gameId = addGame(21, 15, team1, team2);
		expect(gameId).toBeTruthy();
		expect(typeof(gameId)).toBe('number');

		const game = getGameWithPlayers(gameId!);
		expect(game).toBeTruthy();
		expect(game!.team1Score).toBe(21);
		expect(game!.team2Score).toBe(15);
		expect(game!.players.team1).toHaveLength(2);
		expect(game!.players.team2).toHaveLength(2);
		expect(game!.players.team1[0]!.username).toBe('Joe');
		expect(game!.players.team1[1]!.username).toBe('Bob');
		expect(game!.players.team2[0]!.username).toBe('Alice');
		expect(game!.players.team2[1]!.username).toBe('Elizabeth');
	});

	it('Transaction rollback, if Game/GamePlayer fails, nothing goes to database', async () => {
		const { addGame } = await import('../db/queries/games.ts');

		const gameId = addGame(21, 15, 'invalid-uuid', 'invalid-uuid-2');
		expect(gameId).toBeNull();

		const games = testDb.prepare('SELECT COUNT(*) as count from Games').get() as { count: number };
		expect (games.count).toBe(0);
	})
});
