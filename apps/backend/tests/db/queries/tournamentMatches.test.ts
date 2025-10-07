import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb, cleanupTestDb } from '../../setup.ts';

describe('Tournament match queries', () => {
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

  it('creates and lists bracket matches', async () => {
    const { createTournament } = await import('../../../db/queries/tournaments.ts');
    const { createTournamentMatch, listTournamentMatches } = await import(
      '../../../db/queries/tournamentMatches.ts'
    );

    const tournament = createTournament({ name: 'Bracket Cup' });
    expect(tournament).toBeDefined();

    const match = createTournamentMatch({
      tournamentId: tournament!.id,
      roundNumber: 1,
      roundPosition: 1,
    });

    expect(match).toBeDefined();
    expect(match!.status).toBe('pending');

    const matches = listTournamentMatches(tournament!.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].roundNumber).toBe(1);
  });

  it('assigns participants to match slots and enforces uniqueness', async () => {
    const { createTournament } = await import('../../../db/queries/tournaments.ts');
    const { createTournamentParticipant } = await import(
      '../../../db/queries/tournamentParticipants.ts'
    );
    const { createTournamentMatch, addTournamentMatchPlayer, listTournamentMatchPlayers } =
      await import('../../../db/queries/tournamentMatches.ts');

    const tournament = createTournament({ name: 'Assignments' });
    const playerA = createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Alpha' });
    const playerB = createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Beta' });
    expect(playerA).toBeDefined();
    expect(playerB).toBeDefined();

    const match = createTournamentMatch({
      tournamentId: tournament!.id,
      roundNumber: 1,
      roundPosition: 1,
    });
    expect(match).toBeDefined();

    const slot1 = addTournamentMatchPlayer(match!.id, playerA!.id, 1);
    expect(slot1).toBeDefined();
    const slot2 = addTournamentMatchPlayer(match!.id, playerB!.id, 2);
    expect(slot2).toBeDefined();

    const players = listTournamentMatchPlayers(match!.id);
    expect(players).toHaveLength(2);
    expect(players[0].participantId).toBe(playerA!.id);

    const duplicateSlot = addTournamentMatchPlayer(match!.id, playerA!.id, 1);
    expect(duplicateSlot).toBeUndefined();
  });

  it('schedules and completes a match', async () => {
    const { createTournament } = await import('../../../db/queries/tournaments.ts');
    const {
      createTournamentMatch,
      scheduleTournamentMatch,
      updateTournamentMatchStatus,
      linkTournamentMatchResult,
    } = await import('../../../db/queries/tournamentMatches.ts');
    const { addUser } = await import('../../../db/queries/users.ts');
    const { addMatch } = await import('../../../db/queries/matches.ts');

    const tournament = createTournament({ name: 'Finals' });
    const match = createTournamentMatch({
      tournamentId: tournament!.id,
      roundNumber: 2,
      roundPosition: 1,
    });
    expect(match).toBeDefined();

    const scheduled = scheduleTournamentMatch(match!.id, '2024-01-01T10:00:00.000Z');
    expect(scheduled).toBeDefined();
    expect(scheduled!.scheduledAt).toBe('2024-01-01T10:00:00.000Z');

    const statusUpdated = updateTournamentMatchStatus(match!.id, 'in_progress');
    expect(statusUpdated).toBeDefined();
    expect(statusUpdated!.status).toBe('in_progress');

    // Create actual match to link via foreign key
    addUser('player-1', 'Player1', 'hash', 'p1@example.com');
    addUser('player-2', 'Player2', 'hash', 'p2@example.com');
    const matchId = addMatch(21, 15, 'player-1', 'player-2', 5, -5);
    expect(matchId).toBeTruthy();

    const completed = linkTournamentMatchResult(match!.id, matchId!, { setCompleted: true });
    expect(completed).toBeDefined();
    expect(completed!.status).toBe('completed');
    expect(completed!.matchId).toBe(matchId);
    expect(completed!.completedAt).toBeTruthy();
  });
});
