import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';
import fastify from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('../../utils/config.ts', () => ({
  MATCH_SECRET: 'match-secret',
  SECRET: 'test-secret',
  REFRESH_SECRET: 'refresh-secret',
  DATABASE_PATH: ':memory:',
  JWT_ACCESS_TTL: '1h',
  JWT_REFRESH_TTL: '30d',
  JWT_2FA_TTL: '10m',
  TFA_CODE_DIGITS: 6,
  TFA_ISSUER: 'TestApp',
  ACCESS_TOKEN_COOKIE_NAME: 'token',
  REFRESH_TOKEN_COOKIE_NAME: 'refresh_token',
}));

vi.mock('../../db/queries/tournaments.ts', () => ({
  listTournaments: vi.fn(),
  createTournament: vi.fn(),
  getTournamentById: vi.fn(),
  updateTournamentStatus: vi.fn(),
  markTournamentCompleted: vi.fn(),
}));

vi.mock('../../db/queries/tournamentParticipants.ts', () => ({
  listTournamentParticipants: vi.fn(),
  createTournamentParticipant: vi.fn(),
  getTournamentParticipantById: vi.fn(),
  updateTournamentParticipant: vi.fn(),
  removeTournamentParticipant: vi.fn(),
}));

vi.mock('../../db/queries/tournamentMatches.ts', () => ({
  listTournamentMatches: vi.fn(),
  createTournamentMatch: vi.fn(),
  getTournamentMatchById: vi.fn(),
  listTournamentMatchPlayers: vi.fn(),
  updateTournamentMatchStatus: vi.fn(),
  scheduleTournamentMatch: vi.fn(),
  linkTournamentMatchResult: vi.fn(),
  addTournamentMatchPlayer: vi.fn(),
  getTournamentMatchPlayerById: vi.fn(),
  removeTournamentMatchPlayer: vi.fn(),
  clearTournamentMatchPlayers: vi.fn(),
}));

vi.mock('../../services/tournamentOrchestrator.ts', () => ({
  generateSingleEliminationBracket: vi.fn(),
  processSemifinalResult: vi.fn(),
}));

vi.mock('../../services/matchmakingBridge.ts', () => ({
  notifyMatchesReady: vi.fn(),
}));

import * as tournamentQueries from '../../db/queries/tournaments.ts';
import * as participantQueries from '../../db/queries/tournamentParticipants.ts';
import * as matchQueries from '../../db/queries/tournamentMatches.ts';
import * as orchestrator from '../../services/tournamentOrchestrator.ts';
import { notifyMatchesReady } from '../../services/matchmakingBridge.ts';
import { tournamentRoutes } from '../../routes/tournaments.ts';
import { signAccessToken } from '../../utils/jwt.ts';

function buildApp() {
  const app = fastify({ logger: false });
  app.register(cookie);
  app.register(tournamentRoutes, { prefix: '/api/tournaments' });
  return app;
}

const makeAuthHeader = () => ({ authorization: `Bearer ${signAccessToken({ uuid: 'user-1', username: 'tester' })}` });

const sampleTournament = {
  id: 1,
  name: 'Cup',
  description: '',
  format: 'single_elimination',
  status: 'draft',
  maxParticipants: 4,
  startAt: null,
  completedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const sampleParticipant = {
  id: 10,
  tournamentId: 1,
  userUuid: null,
  alias: 'PlayerOne',
  seed: null,
  status: 'pending',
  joinedAt: new Date().toISOString(),
};

const sampleMatch = {
  id: 99,
  tournamentId: 1,
  roundNumber: 1,
  roundPosition: 1,
  status: 'pending',
  matchId: null,
  scheduledAt: null,
  completedAt: null,
};

const sampleMatchPlayer = {
  id: 7,
  tournamentMatchId: 99,
  participantId: 10,
  teamNumber: 1,
};

const sampleBracketSummary = {
  tournamentId: 1,
  participantCount: 4,
  bracketSize: 4,
  totalRounds: 2,
  createdMatches: 4,
  assignedParticipants: 4,
  readyMatches: [101, 102],
  autoAdvancedMatches: [],
  skippedReason: null,
};

describe('Tournament routes', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.resetAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/tournaments returns tournaments', async () => {
    (tournamentQueries.listTournaments as Mock).mockReturnValue([sampleTournament]);

    const res = await app.inject({ method: 'GET', url: '/api/tournaments' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([sampleTournament]);
    expect(tournamentQueries.listTournaments).toHaveBeenCalledWith();
  });

  it('POST /api/tournaments requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      body: { name: 'New Cup' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /api/tournaments creates tournament', async () => {
    (tournamentQueries.createTournament as Mock).mockReturnValue(sampleTournament);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: makeAuthHeader(),
      body: { name: 'Cup' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(sampleTournament);
    expect(tournamentQueries.createTournament).toHaveBeenCalledWith({
      name: 'Cup',
      description: '',
    });
  });

  it('GET /api/tournaments/:id returns 404 when missing', async () => {
    (tournamentQueries.getTournamentById as Mock).mockReturnValue(undefined);

    const res = await app.inject({ method: 'GET', url: '/api/tournaments/1' });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/tournaments/:id/status updates status', async () => {
    const participants = [sampleParticipant, { ...sampleParticipant, id: 11 }, { ...sampleParticipant, id: 12 }, { ...sampleParticipant, id: 13 }];
    (tournamentQueries.getTournamentById as Mock).mockReturnValue(sampleTournament);
    (participantQueries.listTournamentParticipants as Mock).mockReturnValue(participants);
    (tournamentQueries.updateTournamentStatus as Mock).mockReturnValue({ ...sampleTournament, status: 'active' });
    (orchestrator.generateSingleEliminationBracket as Mock).mockReturnValue(sampleBracketSummary);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/tournaments/1/status',
      headers: makeAuthHeader(),
      body: { status: 'active' },
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.tournament.status).toBe('active');
    expect(payload.bracketSummary).toEqual(sampleBracketSummary);
    expect(orchestrator.generateSingleEliminationBracket).toHaveBeenCalledWith(1);
    expect(notifyMatchesReady).toHaveBeenCalledWith(1, sampleBracketSummary.readyMatches);
  });

  it('POST /api/tournaments/:id/complete marks tournament completed', async () => {
    (tournamentQueries.markTournamentCompleted as Mock).mockReturnValue({
      ...sampleTournament,
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/1/complete',
      headers: makeAuthHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
  });

  it('GET /api/tournaments/:id/participants returns list', async () => {
    (participantQueries.listTournamentParticipants as Mock).mockReturnValue([sampleParticipant]);

    const res = await app.inject({ method: 'GET', url: '/api/tournaments/1/participants' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([sampleParticipant]);
  });

  it('POST /api/tournaments/:id/participants creates participant', async () => {
    (tournamentQueries.getTournamentById as Mock).mockReturnValue(sampleTournament);
    (participantQueries.listTournamentParticipants as Mock)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([sampleParticipant]);
    (participantQueries.createTournamentParticipant as Mock).mockReturnValue(sampleParticipant);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/1/participants',
      headers: makeAuthHeader(),
      body: { alias: 'PlayerOne' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ participant: sampleParticipant });
    expect(participantQueries.createTournamentParticipant).toHaveBeenCalledWith({
      tournamentId: 1,
      alias: 'PlayerOne',
    });
    expect(tournamentQueries.updateTournamentStatus).not.toHaveBeenCalled();
    expect(notifyMatchesReady).not.toHaveBeenCalled();
  });

  it('POST /api/tournaments/:id/participants auto-activates at capacity', async () => {
    const draftTournament = { ...sampleTournament, status: 'draft' };
    const existingParticipants = [
      { ...sampleParticipant, id: 2, alias: 'Alpha' },
      { ...sampleParticipant, id: 3, alias: 'Bravo' },
      { ...sampleParticipant, id: 4, alias: 'Charlie' },
    ];
    const afterAdd = [...existingParticipants, sampleParticipant];

    (tournamentQueries.getTournamentById as Mock).mockReturnValue(draftTournament);
    (participantQueries.listTournamentParticipants as Mock)
      .mockReturnValueOnce(existingParticipants)
      .mockReturnValueOnce(afterAdd);
    (participantQueries.createTournamentParticipant as Mock).mockReturnValue(sampleParticipant);
    (tournamentQueries.updateTournamentStatus as Mock).mockReturnValue({ ...sampleTournament, status: 'active' });
    (orchestrator.generateSingleEliminationBracket as Mock).mockReturnValue(sampleBracketSummary);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/1/participants',
      headers: makeAuthHeader(),
      body: { alias: 'PlayerFour' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      participant: sampleParticipant,
      activation: {
        tournament: { ...sampleTournament, status: 'active' },
        bracketSummary: sampleBracketSummary,
      },
    });
    expect(tournamentQueries.updateTournamentStatus).toHaveBeenCalledWith(1, 'active');
    expect(orchestrator.generateSingleEliminationBracket).toHaveBeenCalledWith(1);
    expect(notifyMatchesReady).toHaveBeenCalledWith(1, sampleBracketSummary.readyMatches);
  });

  it('PATCH /api/tournaments/:id/participants/:participantId updates participant', async () => {
    (participantQueries.getTournamentParticipantById as Mock).mockReturnValue(sampleParticipant);
    (participantQueries.updateTournamentParticipant as Mock).mockReturnValue({
      ...sampleParticipant,
      status: 'accepted',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/tournaments/1/participants/10',
      headers: makeAuthHeader(),
      body: { status: 'accepted' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('accepted');
    expect(participantQueries.updateTournamentParticipant).toHaveBeenCalledWith(10, { status: 'accepted' });
  });

  it('DELETE /api/tournaments/:id/participants/:participantId removes participant', async () => {
    (participantQueries.getTournamentParticipantById as Mock).mockReturnValue(sampleParticipant);
    (participantQueries.removeTournamentParticipant as Mock).mockReturnValue(true);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/tournaments/1/participants/10',
      headers: makeAuthHeader(),
    });

    expect(res.statusCode).toBe(204);
    expect(participantQueries.removeTournamentParticipant).toHaveBeenCalledWith(10);
  });

  it('GET /api/tournaments/:id/matches/:matchId/players returns assignments', async () => {
    (matchQueries.getTournamentMatchById as Mock).mockReturnValue(sampleMatch);
    (matchQueries.listTournamentMatchPlayers as Mock).mockReturnValue([sampleMatchPlayer]);

    const res = await app.inject({ method: 'GET', url: '/api/tournaments/1/matches/99/players' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([sampleMatchPlayer]);
    expect(matchQueries.listTournamentMatchPlayers).toHaveBeenCalledWith(99);
  });

  it('DELETE /api/tournaments/:id/matches/:matchId/players clears assignments', async () => {
    (matchQueries.getTournamentMatchById as Mock).mockReturnValue(sampleMatch);
    (matchQueries.clearTournamentMatchPlayers as Mock).mockReturnValue(true);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/tournaments/1/matches/99/players',
      headers: makeAuthHeader(),
    });

    expect(res.statusCode).toBe(204);
    expect(matchQueries.clearTournamentMatchPlayers).toHaveBeenCalledWith(99);
  });

  it('GET /api/tournaments/:id/matches returns matches', async () => {
    (matchQueries.listTournamentMatches as Mock).mockReturnValue([sampleMatch]);

    const res = await app.inject({ method: 'GET', url: '/api/tournaments/1/matches' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([sampleMatch]);
  });


it('PATCH /api/tournaments/:id/matches/:matchId triggers bracket progression', async () => {
  const semifinalMatch = {
    id: 5,
    tournamentId: 1,
    roundNumber: 1,
    roundPosition: 1,
    status: 'completed',
    matchId: 42,
    scheduledAt: null,
    completedAt: new Date().toISOString(),
  };
  (matchQueries.getTournamentMatchById as Mock).mockReturnValue(semifinalMatch);
  (matchQueries.updateTournamentMatchStatus as Mock).mockReturnValue(semifinalMatch);
  (matchQueries.linkTournamentMatchResult as Mock).mockReturnValue(semifinalMatch);
  (orchestrator.processSemifinalResult as Mock).mockReturnValue({ readyMatches: [77], autoAdvancedMatches: [] });

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/tournaments/1/matches/5',
    headers: makeAuthHeader(),
    body: { matchId: 123, setCompleted: true },
  });

  expect(res.statusCode).toBe(200);
  expect(orchestrator.processSemifinalResult).toHaveBeenCalledWith(5);
  expect(notifyMatchesReady).toHaveBeenCalledWith(1, [77]);
});

  it('POST /api/tournaments/:id/matches creates match', async () => {
    (matchQueries.createTournamentMatch as Mock).mockReturnValue(sampleMatch);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/1/matches',
      headers: makeAuthHeader(),
      body: { roundNumber: 1, roundPosition: 1 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(sampleMatch);
    expect(matchQueries.createTournamentMatch).toHaveBeenCalledWith({
      tournamentId: 1,
      roundNumber: 1,
      roundPosition: 1,
    });
  });

  it('PATCH /api/tournaments/:id/matches/:matchId updates status', async () => {
    (matchQueries.getTournamentMatchById as Mock).mockReturnValue(sampleMatch);
    (matchQueries.updateTournamentMatchStatus as Mock).mockReturnValue({
      ...sampleMatch,
      status: 'in_progress',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/tournaments/1/matches/99',
      headers: makeAuthHeader(),
      body: { status: 'in_progress' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('in_progress');
    expect(matchQueries.updateTournamentMatchStatus).toHaveBeenCalledWith(99, 'in_progress', {
      setCompletedAt: false,
    });
  });

  it('POST /api/tournaments/:id/matches/:matchId/players assigns participant', async () => {
    (matchQueries.getTournamentMatchById as Mock).mockReturnValue(sampleMatch);
    (matchQueries.addTournamentMatchPlayer as Mock).mockReturnValue(sampleMatchPlayer);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/1/matches/99/players',
      headers: makeAuthHeader(),
      body: { participantId: 10, teamNumber: 1 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(sampleMatchPlayer);
    expect(matchQueries.addTournamentMatchPlayer).toHaveBeenCalledWith(99, 10, 1);
  });

  it('DELETE /api/tournaments/:id/matches/:matchId/players/:id removes assignment', async () => {
    (matchQueries.getTournamentMatchById as Mock).mockReturnValue(sampleMatch);
    (matchQueries.getTournamentMatchPlayerById as Mock).mockReturnValue(sampleMatchPlayer);
    (matchQueries.removeTournamentMatchPlayer as Mock).mockReturnValue(true);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/tournaments/1/matches/99/players/7',
      headers: makeAuthHeader(),
    });

    expect(res.statusCode).toBe(204);
    expect(matchQueries.removeTournamentMatchPlayer).toHaveBeenCalledWith(7);
  });
});
