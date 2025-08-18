import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, cleanupTestDb } from './setup.ts';
import type { Database } from 'better-sqlite3';

describe('User Functions', () => {
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

	it('Add user and get it by UUID and username', async () => {
		const { addUser, getUserByUuid, getUserByUsername } = await import('../db/queries/users.ts');
		const player1Id = 'uuid-1';
		const user = addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
		expect(user).toBeTruthy();

		const userByUuid = getUserByUuid(player1Id);
		expect(userByUuid).toBeTruthy();
		expect(userByUuid!.username).toBe('Joe');
		const userByUsername = getUserByUsername('Joe');
		expect(userByUsername).toBeTruthy();
		expect(userByUsername!.username).toBe('Joe');
	});

	// it('Create a friendship between two users, check that uniqueness is enforced', async () => {
	// });
});
