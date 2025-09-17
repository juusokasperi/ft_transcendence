import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, cleanupTestDb } from '../../setup.ts';
import type { Database } from 'better-sqlite3';

describe('User Functions', () => {
  let testDb: Database;

  beforeEach(async () => {
    vi.resetModules();
    testDb = await createTestDb();
    vi.doMock('../../../db/client.ts', () => ({
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
      await import('../../../db/queries/users.ts');
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
    const { addUser, getUserStats } = await import('../../../db/queries/users.ts');
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
    const { addUser, getUserStats } = await import('../../../db/queries/users.ts');
    const { deleteUser } = await import('../../../db/queries/userDelete.ts');
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
    const { addUser, getUserStats, updateAvatar } = await import('../../../db/queries/users.ts');
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
    const { addUser, getUserByUuid, updatePassword } = await import('../../../db/queries/users.ts');
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
    const { addUser, getUserStats, updateUsername } = await import('../../../db/queries/users.ts');
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

  it('updateUserRanking updates the ranking field', async () => {
    const { addUser, getUserStats, updateUserRanking } = await import(
      '../../../db/queries/users.ts'
    );
    const playerId = 'uuid-1';
    const user = addUser(playerId, 'Joe', 'hashPass', 'test@mail.com');
    expect(user).toBeTruthy();

    let userStats = getUserStats(playerId);
    expect(userStats).toBeTruthy();
    expect(userStats!.username).toBe('Joe');
    expect(userStats!.ranking).toBe(1000);

    const updateRanking = updateUserRanking(playerId, 1030);
    expect(updateRanking).toBeTruthy();

    userStats = getUserStats(playerId);
    expect(userStats).toBeTruthy();
    expect(userStats!.ranking).toBe(1030);
  });

  it('createUserFromGoogle inserts a user and maps fields', async () => {
    const { createUserFromGoogle, getUserByGoogleId } = await import(
      '../../../db/queries/users.ts'
    );

    const created = createUserFromGoogle({
      googleId: 'g-1',
      email: 'g1@mail.com',
      name: 'Garry',
      picture: '/ava.png',
    });

    expect(created).toBeTruthy();
    expect(created?.email).toBe('g1@mail.com');
    expect(created?.avatar).toBe('/ava.png');
    expect(created?.googleId).toBe('g-1');
    expect(typeof created?.username).toBe('string');
    expect((created?.username ?? '').length).toBeGreaterThan(0);

    const byGoogle = getUserByGoogleId('g-1');
    expect(byGoogle).toBeTruthy();
    expect(byGoogle?.uuid).toBe(created?.uuid);
  });

  it('getUserByGoogleId returns undefined when not found', async () => {
    const { getUserByGoogleId } = await import('../../../db/queries/users.ts');
    expect(getUserByGoogleId('nope')).toBeUndefined();
  });

  it('updateGoogleUser fills ONLY empty fields (soft-sync)', async () => {
    // Manually seed a Google user with empty username/email/avatar
    // so we can verify soft backfill behavior.
    testDb
      .prepare(
        `INSERT INTO Users (uuid, username, email, avatar, google_id, password_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('u-empty', 'u-name', 'new@mail.com', '', 'g-2', '');

    const { updateGoogleUser, getUserByGoogleId } = await import('../../../db/queries/users.ts');

    const ok = updateGoogleUser({
      googleId: 'g-2',
      email: 'new@mail.com',
      name: 'NewName',
      picture: '/new.jpg',
    });
    expect(ok).toBe(true);

    const after = getUserByGoogleId('g-2');
    expect(after).toBeTruthy();
    expect(after?.username).toBe('u-name'); // should NOT override existing username
    expect(after?.email).toBe('new@mail.com');
    expect(after?.avatar).toBe('/new.jpg');
  });

  it('updateGoogleUser does NOT override non-empty fields', async () => {
    // Seed with non-empty values
    testDb
      .prepare(
        `INSERT INTO Users (uuid, username, email, avatar, google_id, password_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('u-has', 'Fixed', 'old@mail.com', '/old.png', 'g-3', '');

    const { updateGoogleUser, getUserByGoogleId } = await import('../../../db/queries/users.ts');

    const ok = updateGoogleUser({
      googleId: 'g-3',
      email: 'newer@mail.com',
      name: 'OverrideMe',
      picture: '/override.png',
    });
    expect(ok).toBe(true);

    const after = getUserByGoogleId('g-3');
    expect(after).toBeTruthy();
    // Should remain unchanged
    expect(after?.username).toBe('Fixed');
    expect(after?.email).toBe('old@mail.com');
    expect(after?.avatar).toBe('/old.png');
  });

  it('linkGoogleToUser sets google_id and backfills avatar ONLY if empty', async () => {
    const { addUser, getUser, getUserByGoogleId, updateAvatar, linkGoogleToUser } = await import(
      '../../../db/queries/users.ts'
    );

    // Case A: avatar empty -> backfill from provided picture
    const aId = 'uuid-A';
    const aUser = addUser(aId, 'Alice', 'hash', 'alice@mail.com');
    expect(aUser).toBeTruthy();
    // Ensure avatar is empty/NULL initially
    const linkedA = linkGoogleToUser(aId, 'g-4', '/avatarA.png');
    expect(linkedA).toBe(true);

    const aByG = getUserByGoogleId('g-4');
    expect(aByG).toBeTruthy();
    expect(aByG?.uuid).toBe(aId);
    expect(aByG?.avatar).toBe('/avatarA.png');

    // Re-linking should be a no-op (already linked)
    const linkedAgain = linkGoogleToUser(aId, 'g-4', '/newPic.png');
    expect(linkedAgain).toBe(false); // no changes

    // Case B: avatar already set -> do NOT override
    const bId = 'uuid-B';
    const bUser = addUser(bId, 'Bill', 'hash', 'bill@mail.com');
    expect(bUser).toBeTruthy();
    const updated = updateAvatar(bId, '/keep.png');
    expect(updated).toBe(true);

    const linkedB = linkGoogleToUser(bId, 'g-5', '/shouldNotOverride.png');
    expect(linkedB).toBe(true);

    const bByG = getUserByGoogleId('g-5');
    expect(bByG).toBeTruthy();
    expect(bByG?.uuid).toBe(bId);
    expect(bByG?.avatar).toBe('/keep.png'); // unchanged
  });
});
