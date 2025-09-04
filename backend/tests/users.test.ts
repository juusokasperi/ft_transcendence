import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, cleanupTestDb } from './setup.ts';
import type { Database } from 'better-sqlite3';

describe('User Functions', () => {
  let testDb: Database;

  beforeEach(async () => {
    vi.resetModules();
    testDb = await createTestDb();
    vi.doMock('../db/client.ts', () => ({
      default: testDb,
    }));
  });

  afterEach(() => {
    cleanupTestDb(testDb);
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Add user and test the getter functions', async () => {
    const { addUser, getUserByUuid, getUserByUsername, getUserByEmail, getUserStats } =
      await import('../db/queries/users.ts');
    const player1Id = 'uuid-1';
    const user = addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    expect(user).toBeTruthy();

    const userByUuid = getUserByUuid(player1Id);
    expect(userByUuid).toBeTruthy();
    expect(userByUuid!.username).toBe('Joe');
    const userByUsername = getUserByUsername('Joe');
    expect(userByUsername).toBeTruthy();
    expect(userByUsername!.username).toBe('Joe');
    const userByEmail = getUserByEmail('test@mail.com');
    expect(userByEmail).toBeTruthy();
    expect(userByEmail!.username).toBe('Joe');
    const userStats = getUserStats(player1Id);
    expect(userStats).toBeTruthy();
    expect(userStats!.username).toBe('Joe');

    const allUserstats = getUserStats();
    expect(allUserstats).toBeTruthy();
    expect(allUserstats).toHaveLength(1);
    expect(allUserstats[0]!.username).toBe('Joe');
  });

  it('Test uuid, email, username uniqueness', async () => {
    const { addUser, getUserStats } = await import('../db/queries/users.ts');
    const player1Id = 'uuid-1';
    const user1 = addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    expect(user1).toBeTruthy();

    // Same UUID as user 1
    const user2 = addUser(player1Id, 'Bob', 'hashPass', 'test1@mail.com');
    expect(user2).toBeFalsy();

    // Same username as user 1
    const player2Id = 'uuid-2';
    const user3 = addUser(player2Id, 'Joe', 'hashPass', 'test2@mail.com');
    expect(user3).toBeFalsy();

    // Same email as user 1
    const player3Id = 'uuid-3';
    const user4 = addUser(player3Id, 'Bobby', 'hashPass', 'test@mail.com');
    expect(user3).toBeFalsy();

    // Make sure only the first addUser call was successful
    const users = getUserStats();
    expect(users).toBeTruthy();
    expect(users).toHaveLength(1);
  });

  it('Delete user', async () => {
    const { addUser, getUserStats } = await import('../db/queries/users.ts');
    const { deleteUser } = await import('../db/queries/userDelete.ts');
    const playerId = 'uuid-1';
    const user = addUser(playerId, 'Joe', 'hashPass', 'test@mail.com');
    expect(user).toBeTruthy();

    let users = getUserStats();
    expect(users).toBeTruthy();
    expect(users).toHaveLength(1);
    expect(users[0]!.username).toBe('Joe');

    const deletedUser = deleteUser(playerId);
    expect(deletedUser).toBeTruthy();

    users = getUserStats();
    expect(users).toBeTruthy();
    expect(users).toHaveLength(0);
  });

  it('Test avatar creation & deletion', async () => {
    const { addUser, getUserStats, updateAvatar } = await import('../db/queries/users.ts');
    const playerId = 'uuid-1';
    const user = addUser(playerId, 'Joe', 'hashPass', 'test@mail.com');
    expect(user).toBeTruthy();

    let userStats = getUserStats(playerId);
    expect(userStats).toBeTruthy();
    expect(userStats!.username).toBe('Joe');
    expect(userStats!.avatar).toBeNull;

    let updateResult = updateAvatar(playerId, '/img.png');
    expect(updateResult).toBeTruthy();

    userStats = getUserStats(playerId);
    expect(userStats).toBeTruthy();
    expect(userStats!.username).toBe('Joe');
    expect(userStats!.avatar).toBe('/img.png');

    updateResult = updateAvatar(playerId);
    expect(updateResult).toBeTruthy();

    userStats = getUserStats(playerId);
    expect(userStats).toBeTruthy();
    expect(userStats!.username).toBe('Joe');
    expect(userStats!.avatar).toBeNull;
  });

  it('Test password change', async () => {
    const { addUser, getUserByUuid, updatePassword } = await import('../db/queries/users.ts');
    const playerId = 'uuid-1';
    const user = addUser(playerId, 'Joe', 'hashPass', 'test@mail.com');
    expect(user).toBeTruthy();

    let userInDb = getUserByUuid(playerId);
    expect(userInDb).toBeTruthy();
    let isValidPassword = 'hashPass' === userInDb?.passwordHash;
    expect(isValidPassword).toBeTruthy();

    const updateResult = updatePassword(playerId, 'newPass');
    expect(updateResult).toBeTruthy();

    userInDb = getUserByUuid(playerId);
    expect(userInDb).toBeTruthy();
    isValidPassword = 'newPass' === userInDb?.passwordHash;
    expect(isValidPassword).toBeTruthy();
  });

  it('Test username change', async () => {
    const { addUser, getUserStats, updateUsername } = await import('../db/queries/users.ts');
    const playerId = 'uuid-1';
    const user = addUser(playerId, 'Joe', 'hashPass', 'test@mail.com');
    expect(user).toBeTruthy();

    let userStats = getUserStats(playerId);
    expect(userStats).toBeTruthy();
    expect(userStats!.username).toBe('Joe');

    const updateResult = updateUsername(playerId, 'Bob');
    expect(updateResult).toBeTruthy();

    userStats = getUserStats(playerId);
    expect(userStats).toBeTruthy();
    expect(userStats!.username).toBe('Bob');
  });
});
