import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb, cleanupTestDb } from '../../setup.ts';

describe('Tournament participant queries', () => {
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

  it('creates and lists participants', async () => {
    const { createTournament } = await import('../../../db/queries/tournaments.ts');
    const { createTournamentParticipant, listTournamentParticipants } = await import(
      '../../../db/queries/tournamentParticipants.ts'
    );

    const tournament = createTournament({ name: 'Qualifier' });
    expect(tournament).toBeDefined();

    const participant = createTournamentParticipant({
      tournamentId: tournament!.id,
      alias: 'PlayerOne',
    });

    expect(participant).toBeDefined();
    expect(participant!.alias).toBe('PlayerOne');
    expect(participant!.status).toBe('pending');

    const participants = listTournamentParticipants(tournament!.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].alias).toBe('PlayerOne');
  });

  it('enforces unique aliases per tournament', async () => {
    const { createTournament } = await import('../../../db/queries/tournaments.ts');
    const { createTournamentParticipant } = await import('../../../db/queries/tournamentParticipants.ts');

    const tournament = createTournament({ name: 'Alias Clash' });
    expect(tournament).toBeDefined();

    const first = createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Duplicate' });
    expect(first).toBeDefined();

    const second = createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Duplicate' });
    expect(second).toBeUndefined();
  });

  it('updates status and seed', async () => {
    const { createTournament } = await import('../../../db/queries/tournaments.ts');
    const { createTournamentParticipant, updateTournamentParticipant } = await import(
      '../../../db/queries/tournamentParticipants.ts'
    );

    const tournament = createTournament({ name: 'Seeding Cup' });
    const participant = createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Seeded' });
    expect(participant).toBeDefined();

    const updatedStatus = updateTournamentParticipant(participant!.id, { status: 'accepted' });
    expect(updatedStatus).toBeDefined();
    expect(updatedStatus!.status).toBe('accepted');

    const updatedSeed = updateTournamentParticipant(participant!.id, { seed: 2 });
    expect(updatedSeed).toBeDefined();
    expect(updatedSeed!.seed).toBe(2);
  });

  it('removes participant', async () => {
    const { createTournament } = await import('../../../db/queries/tournaments.ts');
    const { createTournamentParticipant, removeTournamentParticipant, listTournamentParticipants } =
      await import('../../../db/queries/tournamentParticipants.ts');

    const tournament = createTournament({ name: 'Removal Cup' });
    const participant = createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Temp' });
    expect(participant).toBeDefined();

    const removed = removeTournamentParticipant(participant!.id);
    expect(removed).toBe(true);

    const participants = listTournamentParticipants(tournament!.id);
    expect(participants).toHaveLength(0);
  });
});
