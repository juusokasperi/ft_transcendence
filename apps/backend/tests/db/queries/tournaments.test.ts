import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb, cleanupTestDb } from '../../setup.ts';

describe('Tournament queries', () => {
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

  it('creates a tournament with default values', async () => {
    const { createTournament } = await import('../../../db/queries/tournaments.ts');

    const tournament = createTournament({ name: 'Spring Cup' });

    expect(tournament).toBeDefined();
    expect(tournament!.name).toBe('Spring Cup');
    expect(tournament!.format).toBe('single_elimination');
    expect(tournament!.status).toBe('draft');
    expect(tournament!.description).toBe('');
    expect(tournament!.maxParticipants).toBe(4);
    expect(tournament!.startAt).toBeNull();
    expect(tournament!.completedAt).toBeNull();
  });

  it('respects custom maxParticipants when provided', async () => {
    const { createTournament } = await import('../../../db/queries/tournaments.ts');

    const tournament = createTournament({ name: 'Mini Cup', maxParticipants: 8 });

    expect(tournament).toBeDefined();
    expect(tournament!.maxParticipants).toBe(8);
  });

  it('filters tournaments by status', async () => {
    const { createTournament, listTournaments, updateTournamentStatus } = await import(
      '../../../db/queries/tournaments.ts'
    );

    const draftTournament = createTournament({ name: 'Draft Cup' });
    const activeTournament = createTournament({ name: 'Active Cup', status: 'active' });
    const anotherDraft = createTournament({ name: 'Another Draft' });

    expect(draftTournament).toBeDefined();
    expect(activeTournament).toBeDefined();
    expect(anotherDraft).toBeDefined();

    const updated = updateTournamentStatus(draftTournament!.id, 'active');
    expect(updated).toBeDefined();
    expect(updated!.status).toBe('active');

    const activeList = listTournaments({ status: 'active' });
    expect(activeList).toHaveLength(2);
    expect(activeList.map((t) => t.status)).toEqual(['active', 'active']);
    expect(activeList.map((t) => t.name)).toContain('Draft Cup');
    expect(activeList.map((t) => t.name)).toContain('Active Cup');

    const allTournaments = listTournaments();
    expect(allTournaments).toHaveLength(3);
  });

  it('marks tournament as completed', async () => {
    const { createTournament, markTournamentCompleted } = await import(
      '../../../db/queries/tournaments.ts'
    );

    const tournament = createTournament({ name: 'Final Cup' });
    expect(tournament).toBeDefined();

    const completed = markTournamentCompleted(tournament!.id);
    expect(completed).toBeDefined();
    expect(completed!.status).toBe('completed');
    expect(completed!.completedAt).toBeTruthy();
  });
});
