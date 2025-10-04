import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb, cleanupTestDb } from '../setup.ts';

describe('tournamentOrchestrator', () => {
  let testDb: Database;

  beforeEach(async () => {
    vi.resetModules();
    testDb = await createTestDb();
    vi.doMock('../../db/client.ts', () => ({
      default: testDb,
    }));
  });

  afterEach(() => {
    cleanupTestDb(testDb);
    vi.resetModules();
  });

  it('creates full bracket for 4 participants', async () => {
    const { createTournament } = await import('../../db/queries/tournaments.ts');
    const { createTournamentParticipant, listTournamentParticipants } = await import(
      '../../db/queries/tournamentParticipants.ts'
    );
    const { listTournamentMatches, listTournamentMatchPlayers } = await import(
      '../../db/queries/tournamentMatches.ts'
    );
    const { generateSingleEliminationBracket } = await import('../../services/tournamentOrchestrator.ts');

    const tournament = createTournament({ name: 'Championship' });
    expect(tournament).toBeDefined();

    createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Alpha', seed: 1 });
    createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Bravo', seed: 4 });
    createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Charlie', seed: 2 });
    createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Delta', seed: 3 });

    const participants = listTournamentParticipants(tournament!.id);
    expect(participants).toHaveLength(4);

    const summary = generateSingleEliminationBracket(tournament!.id);
    expect(summary.skippedReason).toBeUndefined();
    expect(summary.createdMatches).toBe(4);
    expect(summary.totalRounds).toBe(2);
    expect(summary.assignedParticipants).toBe(4);

    const matches = listTournamentMatches(tournament!.id);
    expect(matches).toHaveLength(4);

    const roundOneMatches = matches.filter((match) => match.roundNumber === 1);
    expect(roundOneMatches).toHaveLength(2);
    const roundTwoMatches = matches.filter((match) => match.roundNumber === 2);
    expect(roundTwoMatches).toHaveLength(2);

    const matchOnePlayers = listTournamentMatchPlayers(roundOneMatches[0].id);
    const matchTwoPlayers = listTournamentMatchPlayers(roundOneMatches[1].id);
    expect(matchOnePlayers).toHaveLength(2);
    expect(matchTwoPlayers).toHaveLength(2);

    const finalPlayers = listTournamentMatchPlayers(roundTwoMatches[0].id);
    const bronzePlayers = listTournamentMatchPlayers(roundTwoMatches[1].id);
    expect(finalPlayers).toHaveLength(0);
    expect(bronzePlayers).toHaveLength(0);
  });

  it('skips generation when insufficient participants', async () => {
    const { createTournament } = await import('../../db/queries/tournaments.ts');
    const { generateSingleEliminationBracket } = await import('../../services/tournamentOrchestrator.ts');

    const tournament = createTournament({ name: 'Tiny Cup' });
    const summary = generateSingleEliminationBracket(tournament!.id);
    expect(summary.skippedReason).toBe('awaitingParticipants');
    expect(summary.createdMatches).toBe(0);
  });

  it('skips regeneration if matches already exist', async () => {
    const { createTournament } = await import('../../db/queries/tournaments.ts');
    const { createTournamentParticipant } = await import('../../db/queries/tournamentParticipants.ts');
    const { listTournamentMatches } = await import('../../db/queries/tournamentMatches.ts');
    const { generateSingleEliminationBracket } = await import('../../services/tournamentOrchestrator.ts');

    const tournament = createTournament({ name: 'Repeat Cup' });
    createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Alpha' });
    createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Bravo' });
    createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Charlie' });
    createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Delta' });

    const first = generateSingleEliminationBracket(tournament!.id);
    expect(first.createdMatches).toBeGreaterThan(0);

    const second = generateSingleEliminationBracket(tournament!.id);
    expect(second.skippedReason).toBe('matchesAlreadyExist');

    const matches = listTournamentMatches(tournament!.id);
    expect(matches).toHaveLength(first.createdMatches);
  });
});
