import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, cleanupTestDb } from '../../setup.ts';
import type { Database } from 'better-sqlite3';
import db from '../../../db/client.ts';

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
    const { addMatch, addMatchPlayer, getMatchWithPlayers } = await import(
      '../../../db/queries/matches.ts'
    );
    const { addUser } = await import('../../../db/queries/users.ts');
    const player1Id = 'uuid-1';
    const player2Id = 'uuid-2';
    addUser(player1Id, 'Joe', 'hashPass', 'test@mail.com');
    addUser(player2Id, 'Bob', 'hashPass', 'test1@mail.com');

    const matchId = addMatch(21, 15);
    addMatchPlayer(matchId, player1Id, 1, 5);
    addMatchPlayer(matchId, player2Id, 2, 10);
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
    const { addMatch, addMatchPlayer, getMatchWithPlayers } = await import(
      '../../../db/queries/matches.ts'
    );
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

    const matchId = addMatch(21, 15);
    addMatchPlayer(matchId, team1[0], 1, 5);
    addMatchPlayer(matchId, team1[1], 1, 5);
    addMatchPlayer(matchId, team2[0], 2, 10);
    addMatchPlayer(matchId, team2[1], 2, 10);
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

  it('Transaction rollback, if MatchPlayer fails, nothing goes to database', async () => {
    const { addMatch, addMatchPlayer } = await import('../../../db/queries/matches.ts');
    const initialMatchCount = (db.prepare('SELECT COUNT(*) as count FROM Matches').get() as any)
      .count;
    const initialPlayerCount = (
      db.prepare('SELECT COUNT(*) as count FROM MatchPlayers').get() as any
    ).count;

    const failingTransaction = db.transaction(() => {
      const matchId = addMatch(21, 15); // This would succeed
      if (!matchId) throw new Error('Match entry failed unexpectedly');
      addMatchPlayer(matchId, 'invalid-uuid', 1, 11);
      addMatchPlayer(matchId, 'uuid-joe', 2, 5); // This won't even run
    });

    expect(() => {
      failingTransaction();
    }).toThrow();

    const finalMatchCount = (db.prepare('SELECT COUNT(*) as count FROM Matches').get() as any)
      .count;
    const finalPlayerCount = (db.prepare('SELECT COUNT(*) as count FROM MatchPlayers').get() as any)
      .count;
    expect(finalMatchCount).toBe(initialMatchCount);
    expect(finalPlayerCount).toBe(initialPlayerCount);
  });
});
