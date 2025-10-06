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

    const semifinalIds = roundOneMatches.map((match) => match.id).sort((a, b) => a - b);
    expect(summary.readyMatches.sort((a, b) => a - b)).toEqual(semifinalIds);
    expect(summary.autoAdvancedMatches).toHaveLength(0);

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
    expect(summary.readyMatches).toHaveLength(0);
    expect(summary.autoAdvancedMatches).toHaveLength(0);
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
it('advances semifinal winners into final and bronze', async () => {
  const { createTournament } = await import('../../db/queries/tournaments.ts');
  const { createTournamentParticipant } = await import('../../db/queries/tournamentParticipants.ts');
  const { listTournamentMatches, listTournamentMatchPlayers } = await import(
    '../../db/queries/tournamentMatches.ts'
  );
  const { generateSingleEliminationBracket, processSemifinalResult } = await import(
    '../../services/tournamentOrchestrator.ts'
  );
  const { linkTournamentMatchResult } = await import('../../db/queries/tournamentMatches.ts');

  const tournament = createTournament({ name: 'Knockout' });
  createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Alpha', seed: 1 });
  createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Bravo', seed: 4 });
  createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Charlie', seed: 2 });
  createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Delta', seed: 3 });

  generateSingleEliminationBracket(tournament!.id);
  const matches = listTournamentMatches(tournament!.id);
  const semifinal1 = matches.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
  const semifinal2 = matches.find((m) => m.roundNumber === 1 && m.roundPosition === 2)!;
  const finalMatch = matches.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
  const bronzeMatch = matches.find((m) => m.roundNumber === 2 && m.roundPosition === 2)!;

  const matchId = testDb
    .prepare('INSERT INTO Matches (team_1_score, team_2_score) VALUES (?, ?)')
    .run(21, 14).lastInsertRowid as number;
  linkTournamentMatchResult(semifinal1.id, matchId, { setCompleted: true });
  const result = processSemifinalResult(semifinal1.id);
  expect(result).toBeDefined();
  expect(listTournamentMatchPlayers(finalMatch.id)).toHaveLength(1);
  expect(listTournamentMatchPlayers(bronzeMatch.id)).toHaveLength(1);

  const matchId2 = testDb
    .prepare('INSERT INTO Matches (team_1_score, team_2_score) VALUES (?, ?)')
    .run(18, 21).lastInsertRowid as number;
  linkTournamentMatchResult(semifinal2.id, matchId2, { setCompleted: true });
  const finalProgress = processSemifinalResult(semifinal2.id);
  expect(finalProgress).toBeDefined();
  expect(finalProgress!.readyMatches).toContain(finalMatch.id);
  expect(finalProgress!.readyMatches).toContain(bronzeMatch.id);
  expect(listTournamentMatchPlayers(finalMatch.id)).toHaveLength(2);
  expect(listTournamentMatchPlayers(bronzeMatch.id)).toHaveLength(2);
});

it('allows manual semifinal result reporting', async () => {
  const { createTournament } = await import('../../db/queries/tournaments.ts');
  const { createTournamentParticipant } = await import('../../db/queries/tournamentParticipants.ts');
  const { listTournamentMatches, listTournamentMatchPlayers } = await import(
    '../../db/queries/tournamentMatches.ts'
  );
  const { generateSingleEliminationBracket, processSemifinalResult } = await import(
    '../../services/tournamentOrchestrator.ts'
  );

  const tournament = createTournament({ name: 'Manual Cup' });
  createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Alpha', seed: 1 });
  createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Bravo', seed: 4 });
  createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Charlie', seed: 2 });
  createTournamentParticipant({ tournamentId: tournament!.id, alias: 'Delta', seed: 3 });

  generateSingleEliminationBracket(tournament!.id);
  const matches = listTournamentMatches(tournament!.id);
  const semifinal = matches.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
  const finalMatch = matches.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
  const bronzeMatch = matches.find((m) => m.roundNumber === 2 && m.roundPosition === 2)!;

  const semifinalPlayers = listTournamentMatchPlayers(semifinal.id);
  const team1 = semifinalPlayers.find((p) => p.teamNumber === 1)!;
  const team2 = semifinalPlayers.find((p) => p.teamNumber === 2)!;

  const progression = processSemifinalResult(semifinal.id, {
    manualResult: { winnerParticipantId: team1.participantId, loserParticipantId: team2.participantId },
  });

  expect(progression).toBeDefined();
  expect(listTournamentMatchPlayers(finalMatch.id)).toHaveLength(1);
  expect(listTournamentMatchPlayers(bronzeMatch.id)).toHaveLength(1);
});

});
