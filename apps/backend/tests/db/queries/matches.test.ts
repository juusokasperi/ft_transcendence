import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, cleanupTestDb } from '../../setup.ts';
import type { Database } from 'better-sqlite3';

describe('Match Functions', () => {
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

  it('Create 1v1 match', async () => {
    const { addMatch, getMatchWithPlayers } = await import('../../../db/queries/matches.ts');
    const { addUser } = await import('../../../db/queries/users.ts');
    const player1Id = 'uuid-1';
    const player2Id = 'uuid-2';
    addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');

    const matchId = addMatch(21, 15, player1Id, player2Id, 5, 10);
    expect(matchId).toBeTruthy();
    expect(typeof matchId).toBe('number');

    const match = getMatchWithPlayers(matchId!);
    expect(match).toBeTruthy();
    expect(match!.team1Score).toBe(21);
    expect(match!.team2Score).toBe(15);
    expect(match!.players.team1).toHaveLength(1);
    expect(match!.players.team2).toHaveLength(1);
    expect(match!.players.team1[0]!.username).toBe('Joe');
    expect(match!.players.team2[0]!.username).toBe('Bob');
  });

  it('Create 2v2 match', async () => {
    const { addMatch, getMatchWithPlayers } = await import('../../../db/queries/matches.ts');
    const { addUser } = await import('../../../db/queries/users.ts');
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

    const matchId = addMatch(21, 15, team1, team2, 5, 10);
    expect(matchId).toBeTruthy();
    expect(typeof matchId).toBe('number');

    const match = getMatchWithPlayers(matchId!);
    expect(match).toBeTruthy();
    expect(match!.team1Score).toBe(21);
    expect(match!.team2Score).toBe(15);
    expect(match!.players.team1).toHaveLength(2);
    expect(match!.players.team2).toHaveLength(2);
    expect(match!.players.team1[0]!.username).toBe('Joe');
    expect(match!.players.team1[1]!.username).toBe('Bob');
    expect(match!.players.team2[0]!.username).toBe('Alice');
    expect(match!.players.team2[1]!.username).toBe('Elizabeth');
  });

  it('Transaction rollback, if Match/MatchPlayer fails, nothing goes to database', async () => {
    const { addMatch } = await import('../../../db/queries/matches.ts');

    const matchId = addMatch(21, 15, 'invalid-uuid', 'invalid-uuid-2', 11, 5);
    expect(matchId).toBeNull();

    const matches = testDb.prepare('SELECT COUNT(*) as count from Matches').get() as {
      count: number;
    };
    expect(matches.count).toBe(0);
  });
});
