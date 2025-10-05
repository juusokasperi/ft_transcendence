import type { FastifyInstance } from 'fastify';
import { authPreHandler } from '../hooks/auth.ts';
import {
  createTournament,
  getTournamentById,
  listTournaments,
  markTournamentCompleted,
  updateTournamentStatus,
} from '../db/queries/tournaments.ts';
import { generateSingleEliminationBracket, processSemifinalResult } from '../services/tournamentOrchestrator.ts';
import { notifyMatchesReady } from '../services/matchmakingBridge.ts';
import {
  createTournamentParticipant,
  getTournamentParticipantById,
  listTournamentParticipants,
  removeTournamentParticipant,
  updateTournamentParticipant,
} from '../db/queries/tournamentParticipants.ts';
import {
  addTournamentMatchPlayer,
  createTournamentMatch,
  getTournamentMatchById,
  getTournamentMatchPlayerById,
  listTournamentMatchPlayers,
  listTournamentMatches,
  linkTournamentMatchResult,
  removeTournamentMatchPlayer,
  scheduleTournamentMatch,
  updateTournamentMatchStatus,
  clearTournamentMatchPlayers,
} from '../db/queries/tournamentMatches.ts';
import {
  addMatchPlayerSchema,
  clearMatchPlayersSchema,
  completeTournamentSchema,
  createMatchSchema,
  createParticipantSchema,
  createTournamentSchema,
  deleteMatchPlayerSchema,
  deleteParticipantSchema,
  getTournamentSchema,
  listMatchPlayersSchema,
  listMatchesSchema,
  listParticipantsSchema,
  listTournamentsSchema,
  updateMatchSchema,
  updateParticipantSchema,
  updateTournamentStatusSchema,
} from '../schemas/tournamentSchemas.ts';

export async function tournamentRoutes(app: FastifyInstance) {
  app.get(
    '/',
    {
      schema: listTournamentsSchema,
    },
    async (req, res) => {
      try {
        const { status } = req.query as { status?: string };
        const tournaments = status ? listTournaments({ status }) : listTournaments();
        return res.status(200).send(tournaments);
      } catch (error) {
        req.log.error({ error }, 'Failed to list tournaments');
        return res.status(500).send({ message: 'Failed to list tournaments' });
      }
    },
  );

  app.post(
    '/',
    {
      schema: createTournamentSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const body = req.body as {
          name: string;
          description?: string;
          format?: string;
          status?: string;
          maxParticipants?: number | null;
          startAt?: string | null;
        };
        const tournament = createTournament(body);
        if (!tournament)
          return res.status(409).send({ message: 'Unable to create tournament with provided data' });
        return res.status(201).send(tournament);
      } catch (error) {
        req.log.error({ error }, 'Failed to create tournament');
        return res.status(500).send({ message: 'Failed to create tournament' });
      }
    },
  );

  app.get(
    '/:tournamentId',
    {
      schema: getTournamentSchema,
    },
    async (req, res) => {
      try {
        const { tournamentId } = req.params as { tournamentId: number };
        const tournament = getTournamentById(tournamentId);
        if (!tournament) return res.status(404).send({ message: 'Tournament not found' });
        return res.status(200).send(tournament);
      } catch (error) {
        req.log.error({ error }, 'Failed to fetch tournament');
        return res.status(500).send({ message: 'Failed to fetch tournament' });
      }
    },
  );

  app.patch(
    '/:tournamentId/status',
    {
      schema: updateTournamentStatusSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId } = req.params as { tournamentId: number };
        const { status } = req.body as { status: string };
        const current = getTournamentById(tournamentId);
        if (!current) return res.status(404).send({ message: 'Tournament not found' });

        if (status === 'active') {
          const participants = listTournamentParticipants(tournamentId);
          const maxParticipants = current.maxParticipants ?? 4;
          if (participants.length !== maxParticipants)
            return res.status(409).send({ message: 'Tournament requires 4 participants before activation' });
        }

        const updated = updateTournamentStatus(tournamentId, status);
        if (!updated) return res.status(404).send({ message: 'Tournament not found' });

        let bracketSummary;
        if (current.status !== 'active' && updated.status === 'active') {
          bracketSummary = generateSingleEliminationBracket(tournamentId);
        }

        const responsePayload: Record<string, unknown> = { tournament: updated };
        if (bracketSummary) {
          responsePayload.bracketSummary = bracketSummary;
          if (bracketSummary.readyMatches?.length)
            notifyMatchesReady(tournamentId, bracketSummary.readyMatches);
        }

        return res.status(200).send(responsePayload);
      } catch (error) {
        req.log.error({ error }, 'Failed to update tournament status');
        return res.status(500).send({ message: 'Failed to update tournament status' });
      }
    },
  );

  app.post(
    '/:tournamentId/complete',
    {
      schema: completeTournamentSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId } = req.params as { tournamentId: number };
        const completed = markTournamentCompleted(tournamentId);
        if (!completed) return res.status(404).send({ message: 'Tournament not found' });
        return res.status(200).send(completed);
      } catch (error) {
        req.log.error({ error }, 'Failed to mark tournament complete');
        return res.status(500).send({ message: 'Failed to mark tournament complete' });
      }
    },
  );

  app.get(
    '/:tournamentId/participants',
    {
      schema: listParticipantsSchema,
    },
    async (req, res) => {
      try {
        const { tournamentId } = req.params as { tournamentId: number };
        const participants = listTournamentParticipants(tournamentId);
        return res.status(200).send(participants);
      } catch (error) {
        req.log.error({ error }, 'Failed to list participants');
        return res.status(500).send({ message: 'Failed to list participants' });
      }
    },
  );

  app.post(
    '/:tournamentId/participants',
    {
      schema: createParticipantSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId } = req.params as { tournamentId: number };
        const body = req.body as {
          alias: string;
          userUuid?: string | null;
          seed?: number | null;
          status?: string;
        };

        const tournament = getTournamentById(tournamentId);
        if (!tournament) return res.status(404).send({ message: 'Tournament not found' });

        const currentParticipants = listTournamentParticipants(tournamentId);
        const maxParticipants = tournament.maxParticipants ?? 4;
        if (currentParticipants.length >= maxParticipants)
          return res.status(409).send({ message: 'Tournament already has maximum participants' });

        const participant = createTournamentParticipant({ tournamentId, ...body });
        if (!participant)
          return res.status(409).send({ message: 'Unable to register participant with provided data' });

        const allParticipants = listTournamentParticipants(tournamentId);
        let activation;
        if (tournament.status !== 'active' && allParticipants.length === maxParticipants) {
          const updated = updateTournamentStatus(tournamentId, 'active');
          if (!updated) return res.status(500).send({ message: 'Failed to activate tournament' });
          const bracketSummary = generateSingleEliminationBracket(tournamentId);
          activation = { tournament: updated, bracketSummary };
          if (bracketSummary.readyMatches.length)
            notifyMatchesReady(tournamentId, bracketSummary.readyMatches);
        }

        return res.status(201).send({ participant, activation });
      } catch (error) {
        req.log.error({ error }, 'Failed to create participant');
        return res.status(500).send({ message: 'Failed to create participant' });
      }
    },
  );

  app.patch(
    '/:tournamentId/participants/:participantId',
    {
      schema: updateParticipantSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId, participantId } = req.params as { tournamentId: number; participantId: number };
        const body = req.body as {
          alias?: string;
          seed?: number | null;
          status?: string;
          userUuid?: string | null;
        };
        const existing = getTournamentParticipantById(participantId);
        if (!existing || existing.tournamentId !== tournamentId)
          return res.status(404).send({ message: 'Participant not found for tournament' });
        const updated = updateTournamentParticipant(participantId, body);
        if (!updated)
          return res.status(409).send({ message: 'Unable to update participant with provided data' });
        return res.status(200).send(updated);
      } catch (error) {
        req.log.error({ error }, 'Failed to update participant');
        return res.status(500).send({ message: 'Failed to update participant' });
      }
    },
  );

  app.delete(
    '/:tournamentId/participants/:participantId',
    {
      schema: deleteParticipantSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId, participantId } = req.params as { tournamentId: number; participantId: number };
        const existing = getTournamentParticipantById(participantId);
        if (!existing || existing.tournamentId !== tournamentId)
          return res.status(404).send({ message: 'Participant not found for tournament' });
        const removed = removeTournamentParticipant(participantId);
        if (!removed) return res.status(500).send({ message: 'Failed to remove participant' });
        return res.status(204).send();
      } catch (error) {
        req.log.error({ error }, 'Failed to remove participant');
        return res.status(500).send({ message: 'Failed to remove participant' });
      }
    },
  );

  app.get(
    '/:tournamentId/matches',
    {
      schema: listMatchesSchema,
    },
    async (req, res) => {
      try {
        const { tournamentId } = req.params as { tournamentId: number };
        const matches = listTournamentMatches(tournamentId);
        return res.status(200).send(matches);
      } catch (error) {
        req.log.error({ error }, 'Failed to list tournament matches');
        return res.status(500).send({ message: 'Failed to list tournament matches' });
      }
    },
  );

  app.post(
    '/:tournamentId/matches',
    {
      schema: createMatchSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId } = req.params as { tournamentId: number };
        const body = req.body as {
          roundNumber: number;
          roundPosition: number;
          status?: string;
          scheduledAt?: string | null;
        };
        const match = createTournamentMatch({ tournamentId, ...body });
        if (!match)
          return res.status(409).send({ message: 'Unable to create tournament match with provided data' });
        return res.status(201).send(match);
      } catch (error) {
        req.log.error({ error }, 'Failed to create tournament match');
        return res.status(500).send({ message: 'Failed to create tournament match' });
      }
    },
  );

  app.patch(
    '/:tournamentId/matches/:matchId',
    {
      schema: updateMatchSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId, matchId } = req.params as { tournamentId: number; matchId: number };
        const body = req.body as {
          status?: string;
          scheduledAt?: string | null;
          matchId?: number | null;
          setCompleted?: boolean;
        };
        let match = getTournamentMatchById(matchId);
        if (!match || match.tournamentId !== tournamentId)
          return res.status(404).send({ message: 'Tournament match not found' });

        if (Object.prototype.hasOwnProperty.call(body, 'status') && body.status) {
          const updated = updateTournamentMatchStatus(matchId, body.status, {
            setCompletedAt: body.setCompleted === true,
          });
          if (!updated) return res.status(500).send({ message: 'Failed to update match status' });
          match = updated;
        }

        if (Object.prototype.hasOwnProperty.call(body, 'scheduledAt')) {
          const updated = scheduleTournamentMatch(matchId, body.scheduledAt ?? null);
          if (!updated) return res.status(500).send({ message: 'Failed to update match schedule' });
          match = updated;
        }

        if (Object.prototype.hasOwnProperty.call(body, 'matchId')) {
          const updated = linkTournamentMatchResult(matchId, body.matchId ?? null, {
            setCompleted: body.setCompleted === true,
          });
          if (!updated) return res.status(500).send({ message: 'Failed to link match result' });
          match = updated;
        }

        if (match.status === 'completed' && match.roundNumber === 1) {
          const progression = processSemifinalResult(match.id);
          if (progression) {
            if (progression.readyMatches.length)
              notifyMatchesReady(tournamentId, progression.readyMatches);
          }
        }

        return res.status(200).send(match);
      } catch (error) {
        req.log.error({ error }, 'Failed to update tournament match');
        return res.status(500).send({ message: 'Failed to update tournament match' });
      }
    },
  );

  app.get(
    '/:tournamentId/matches/:matchId/players',
    {
      schema: listMatchPlayersSchema,
    },
    async (req, res) => {
      try {
        const { tournamentId, matchId } = req.params as { tournamentId: number; matchId: number };
        const match = getTournamentMatchById(matchId);
        if (!match || match.tournamentId !== tournamentId)
          return res.status(404).send({ message: 'Tournament match not found' });
        const players = listTournamentMatchPlayers(matchId);
        return res.status(200).send(players);
      } catch (error) {
        req.log.error({ error }, 'Failed to list match participants');
        return res.status(500).send({ message: 'Failed to list match participants' });
      }
    },
  );

  app.delete(
    '/:tournamentId/matches/:matchId/players',
    {
      schema: clearMatchPlayersSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId, matchId } = req.params as { tournamentId: number; matchId: number };
        const match = getTournamentMatchById(matchId);
        if (!match || match.tournamentId !== tournamentId)
          return res.status(404).send({ message: 'Tournament match not found' });
        const cleared = clearTournamentMatchPlayers(matchId);
        if (!cleared) return res.status(500).send({ message: 'Failed to clear match participants' });
        return res.status(204).send();
      } catch (error) {
        req.log.error({ error }, 'Failed to clear match participants');
        return res.status(500).send({ message: 'Failed to clear match participants' });
      }
    },
  );

  app.post(
    '/:tournamentId/matches/:matchId/players',
    {
      schema: addMatchPlayerSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId, matchId } = req.params as { tournamentId: number; matchId: number };
        const body = req.body as { participantId: number; teamNumber: number };
        const match = getTournamentMatchById(matchId);
        if (!match || match.tournamentId !== tournamentId)
          return res.status(404).send({ message: 'Tournament match not found' });
        const assignment = addTournamentMatchPlayer(matchId, body.participantId, body.teamNumber);
        if (!assignment)
          return res.status(409).send({ message: 'Unable to assign participant to match slot' });
        return res.status(201).send(assignment);
      } catch (error) {
        req.log.error({ error }, 'Failed to assign participant to match');
        return res.status(500).send({ message: 'Failed to assign participant to match' });
      }
    },
  );

  app.delete(
    '/:tournamentId/matches/:matchId/players/:matchPlayerId',
    {
      schema: deleteMatchPlayerSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId, matchId, matchPlayerId } = req.params as {
          tournamentId: number;
          matchId: number;
          matchPlayerId: number;
        };
        const match = getTournamentMatchById(matchId);
        if (!match || match.tournamentId !== tournamentId)
          return res.status(404).send({ message: 'Tournament match not found' });
        const assignment = getTournamentMatchPlayerById(matchPlayerId);
        if (!assignment || assignment.tournamentMatchId !== matchId)
          return res.status(404).send({ message: 'Match participant not found' });
        const removed = removeTournamentMatchPlayer(matchPlayerId);
        if (!removed) return res.status(500).send({ message: 'Failed to remove participant from match' });
        return res.status(204).send();
      } catch (error) {
        req.log.error({ error }, 'Failed to remove participant from match');
        return res.status(500).send({ message: 'Failed to remove participant from match' });
      }
    },
  );
}
