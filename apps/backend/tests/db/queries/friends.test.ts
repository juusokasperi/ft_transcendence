import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, cleanupTestDb } from '../../setup.ts';
import type { Database } from 'better-sqlite3';

describe('Friends Functions', () => {
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

  it('Send a friendship request, check the pendings for both users', async () => {
    const { addUser } = await import('../../../db/queries/users.ts');
    const {
      addFriend,
      getFriends,
      getPendingFriendRequestsSent,
      getPendingFriendRequestsReceived,
    } = await import('../../../db/queries/friends.ts');
    const player1Id = 'uuid-1';
    const player2Id = 'uuid-2';
    addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');

    const addResult = addFriend(player1Id, player2Id);
    expect(addResult).toBeTruthy();

    // Check that the received for player 1 is empty
    const player1PendingReceived = getPendingFriendRequestsReceived(player1Id);
    expect(player1PendingReceived).toHaveLength(0);
    // Check that the sent for player 1 is length === 1
    const player1PendingSent = getPendingFriendRequestsSent(player1Id);
    expect(player1PendingSent).toHaveLength(1);
    expect(player1PendingSent[0]!.uuid).toBe('uuid-2');
    // Check that the sent for player 2 is empty
    const player2PendingSent = getPendingFriendRequestsSent(player2Id);
    expect(player2PendingSent).toHaveLength(0);
    // Check that the received for player 2 is length === 1
    const player2PendingReceived = getPendingFriendRequestsReceived(player2Id);
    expect(player2PendingReceived).toHaveLength(1);
    expect(player2PendingReceived[0]!.uuid).toBe('uuid-1');

    // Check the accepted friends list for both users to make sure it is empty
    const player1Friends = getFriends(player1Id);
    expect(player1Friends).toHaveLength(0);
    const player2Friends = getFriends(player2Id);
    expect(player2Friends).toHaveLength(0);
  });

  it('Accept a friendship request', async () => {
    const { addUser } = await import('../../../db/queries/users.ts');
    const { addFriend, respondToFriendReq, getFriends } = await import(
      '../../../db/queries/friends.ts'
    );
    const player1Id = 'uuid-1';
    const player2Id = 'uuid-2';
    addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');

    const addResult = addFriend(player1Id, player2Id);
    expect(addResult).toBeTruthy();

    // Accept friend request
    const responseRes = respondToFriendReq(player2Id, player1Id, true);
    expect(responseRes).toBeTruthy();

    // Check that both users friend lists were updated
    const player1Friends = getFriends(player1Id);
    expect(player1Friends).toHaveLength(1);
    expect(player1Friends[0]!.username).toBe('Bob');
    const player2Friends = getFriends(player2Id);
    expect(player2Friends).toHaveLength(1);
    expect(player2Friends[0]!.username).toBe('Joe');
  });

  it('Decline a friendship request', async () => {
    const { addUser } = await import('../../../db/queries/users.ts');
    const {
      addFriend,
      respondToFriendReq,
      getFriends,
      getPendingFriendRequestsReceived,
      getPendingFriendRequestsSent,
    } = await import('../../../db/queries/friends.ts');
    const player1Id = 'uuid-1';
    const player2Id = 'uuid-2';
    addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');

    const addResult = addFriend(player1Id, player2Id);
    expect(addResult).toBeTruthy();

    // Decline friend request
    const responseRes = respondToFriendReq(player2Id, player1Id, false);
    expect(responseRes).toBeTruthy();

    // Check that both users friend lists are empty
    const player1Friends = getFriends(player1Id);
    expect(player1Friends).toHaveLength(0);
    const player2Friends = getFriends(player2Id);
    expect(player2Friends).toHaveLength(0);

    // Check that the pending lists are also empty
    const player1PendingReceived = getPendingFriendRequestsReceived(player1Id);
    expect(player1PendingReceived).toHaveLength(0);
    const player1PendingSent = getPendingFriendRequestsSent(player1Id);
    expect(player1PendingSent).toHaveLength(0);
    const player2PendingSent = getPendingFriendRequestsSent(player2Id);
    expect(player2PendingSent).toHaveLength(0);
    const player2PendingReceived = getPendingFriendRequestsReceived(player2Id);
    expect(player2PendingReceived).toHaveLength(0);
  });

  it('Delete a friendship', async () => {
    const { addUser } = await import('../../../db/queries/users.ts');
    const { addFriend, deleteFriend, respondToFriendReq, getFriends } = await import(
      '../../../db/queries/friends.ts'
    );
    const player1Id = 'uuid-1';
    const player2Id = 'uuid-2';
    addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');

    const addResult = addFriend(player1Id, player2Id);
    expect(addResult).toBeTruthy();

    // Accept friend request
    const responseRes = respondToFriendReq(player2Id, player1Id, true);
    expect(responseRes).toBeTruthy();

    // Check that both users friend lists were updated
    let player1Friends = getFriends(player1Id);
    expect(player1Friends).toHaveLength(1);
    expect(player1Friends[0]!.username).toBe('Bob');
    let player2Friends = getFriends(player2Id);
    expect(player2Friends).toHaveLength(1);
    expect(player2Friends[0]!.username).toBe('Joe');

    // Check the delete friend works
    const deleteFriendRes = deleteFriend(player1Id, player2Id);
    expect(deleteFriendRes).toBeTruthy();

    // Check that both users friend lists are empty
    player1Friends = getFriends(player1Id);
    expect(player1Friends).toHaveLength(0);
    player2Friends = getFriends(player2Id);
    expect(player2Friends).toHaveLength(0);
  });

  it('Create a friendship between two users, check that uniqueness is enforced', async () => {
    const { addUser } = await import('../../../db/queries/users.ts');
    const {
      addFriend,
      respondToFriendReq,
      getFriends,
      getPendingFriendRequestsSent,
      getPendingFriendRequestsReceived,
    } = await import('../../../db/queries/friends.ts');
    const player1Id = 'uuid-1';
    const player2Id = 'uuid-2';
    addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');

    const addResult = addFriend(player1Id, player2Id);
    expect(addResult).toBeTruthy();

    // Check that this fails when player1 has already sent a request to player2
    const addReverseResult = addFriend(player2Id, player1Id);
    expect(addReverseResult).toBeFalsy();

    // Accept friend request
    const responseRes = respondToFriendReq(player2Id, player1Id, true);
    expect(responseRes).toBeTruthy();

    // Check that both users friend lists were updated
    const player1Friends = getFriends(player1Id);
    expect(player1Friends).toHaveLength(1);
    expect(player1Friends[0]!.username).toBe('Bob');
    const player2Friends = getFriends(player2Id);
    expect(player2Friends).toHaveLength(1);
    expect(player2Friends[0]!.username).toBe('Joe');

    // Try to do a new friend request, should not succeed
    const addAgainResult = addFriend(player2Id, player1Id);
    expect(addAgainResult).toBeFalsy();
  });

  it('Create a friendship between two users, delete the other user and check that the friendship gets deleted', async () => {
    const { addUser } = await import('../../../db/queries/users.ts');
    const { deleteUser } = await import('../../../db/queries/userDelete.ts');
    const { addFriend, respondToFriendReq, getFriends } = await import(
      '../../../db/queries/friends.ts'
    );
    const player1Id = 'uuid-1';
    const player2Id = 'uuid-2';
    addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');

    const addResult = addFriend(player1Id, player2Id);
    expect(addResult).toBeTruthy();

    // Accept friend request
    const responseRes = respondToFriendReq(player2Id, player1Id, true);
    expect(responseRes).toBeTruthy();

    // Check that both users friend lists were updated
    let player1Friends = getFriends(player1Id);
    expect(player1Friends).toHaveLength(1);
    expect(player1Friends[0]!.username).toBe('Bob');
    const player2Friends = getFriends(player2Id);
    expect(player2Friends).toHaveLength(1);
    expect(player2Friends[0]!.username).toBe('Joe');

    // Delete player2
    const deleteRes = deleteUser(player2Id);
    expect(deleteRes).toBeTruthy();
    // Now getFriends should return an empty array
    player1Friends = getFriends(player1Id);
    expect(player1Friends).toHaveLength(0);
  });
});
