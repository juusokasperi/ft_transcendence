import type { FastifyInstance } from 'fastify';
import { authPreHandler, matchAuthPreHandler } from '../hooks/auth.ts';
import { addMatch } from '../db/queries/matches.ts';
import {
  createTournament,
  getTournamentById,
  listTournaments,
  findUserActiveTournament,
  markTournamentCompleted,
  updateTournamentStatus,
} from '../db/queries/tournaments.ts';
import { 
  generateSingleEliminationBracket, 
  processSemifinalResult,
  checkAndAutoCompleteTournament,
} from '../services/tournamentOrchestrator.ts';
import type { MatchProgression } from '../services/tournamentOrchestrator.ts';
import { notifyMatchesReady, notifyTournamentStateUpdated } from '../services/matchmakingBridge.ts';
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
  getTournamentMatchByRoundAndPosition,
  linkTournamentMatchResult,
  getTournamentMatchPlayerById,
  listTournamentMatchPlayers,
  listTournamentMatches,
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
  getMyActiveTournamentSchema,
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
  reportMatchResultSchema,
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

  app.get(
    '/my/active',
    {
      schema: getMyActiveTournamentSchema,
      preHandler: [authPreHandler],
    },
    async (req, res) => {
      try {
        const userUuid = (req.user as { uuid?: string } | undefined)?.uuid;
        if (!userUuid) return res.status(200).send(null);

        const active = findUserActiveTournament(userUuid);
        if (!active) return res.status(200).send(null);

        const participant = getTournamentParticipantById(active.participantId);
        if (!participant) return res.status(200).send(null);

        return res.status(200).send({ tournament: active.tournament, participant });
      } catch (error) {
        req.log.error({ error }, 'Failed to fetch active tournament for user');
        return res.status(500).send({ message: 'Failed to fetch active tournament' });
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

        const userUuid = (req.user as { uuid?: string } | undefined)?.uuid;
        if (userUuid) {
          const existing = findUserActiveTournament(userUuid);
          if (existing) {
            return res.status(409).send({
              message: 'You already have a tournament in progress',
              code: 'tournament_active',
              tournamentId: existing.tournament.id,
            });
          }
        }

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
          // Update all participants to 'active' status when tournament starts
          const participants = listTournamentParticipants(tournamentId);
          for (const participant of participants) {
            if (participant.status === 'pending') {
              updateTournamentParticipant(participant.id, { status: 'active' });
            }
          }
          
          bracketSummary = generateSingleEliminationBracket(tournamentId);
        }

        const responsePayload: Record<string, unknown> = { tournament: updated };
        if (bracketSummary) {
          responsePayload.bracketSummary = bracketSummary;
          if (bracketSummary.readyMatches?.length)
            await notifyMatchesReady(tournamentId, bracketSummary.readyMatches);
        }

        return res.status(200).send(responsePayload);
      } catch (error) {
        req.log.error({ error }, 'Failed to update tournament status');
        return res.status(500).send({ message: 'Failed to update tournament status' });
      }
    },
  );

  app.post(
    '/:tournamentId/matches/:matchId/result',
    {
      schema: reportMatchResultSchema,
      preHandler: [matchAuthPreHandler],
    },
    async (req, res) => {
      try {
        const { tournamentId, matchId } = req.params as { tournamentId: number; matchId: number };
        const body = req.body as {
          winnerParticipantId: number;
          loserParticipantId: number;
          winnerUserUuid?: string | null;
          loserUserUuid?: string | null;
          gamesHistory?: Array<{ gameIndex: number; east: number; west: number; winner: string }>;
        };

        const match = getTournamentMatchById(matchId);
        if (!match || match.tournamentId !== tournamentId)
          return res.status(404).send({ message: 'Tournament match not found' });

        const roster = listTournamentMatchPlayers(matchId);
        const rosterParticipantIds = new Set(roster.map((player) => player.participantId));
        if (
          !rosterParticipantIds.has(body.winnerParticipantId) ||
          !rosterParticipantIds.has(body.loserParticipantId)
        ) {
          return res
            .status(400)
            .send({ message: 'Submitted participants are not assigned to this match' });
        }

        // Create a Match record for the completed tournament match to track scores
        let createdMatchId: number | null = null;
        let actualWinnerParticipantId: number | null = null;
        let actualLoserParticipantId: number | null = null;
        
        if (body.winnerUserUuid && body.loserUserUuid && body.gamesHistory && body.gamesHistory.length > 0) {
          try {
            req.log.info({ 
              matchId, 
              gamesHistoryLength: body.gamesHistory.length,
              gamesHistory: body.gamesHistory 
            }, 'Processing tournament match result');
            
            // Find which player is team1 (east) and team2 (west) based on roster
            const winnerPlayer = roster.find(p => p.participantId === body.winnerParticipantId);
            const loserPlayer = roster.find(p => p.participantId === body.loserParticipantId);
            
            if (winnerPlayer && loserPlayer) {
              // Determine UUIDs based on team numbers (team1 = teamNumber 1, team2 = teamNumber 2)
              const team1Player = winnerPlayer.teamNumber === 1 ? winnerPlayer : loserPlayer;
              const team2Player = winnerPlayer.teamNumber === 1 ? loserPlayer : winnerPlayer;
              const team1Uuid = team1Player.participantId === body.winnerParticipantId ? body.winnerUserUuid : body.loserUserUuid;
              const team2Uuid = team2Player.participantId === body.winnerParticipantId ? body.winnerUserUuid : body.loserUserUuid;

              // Calculate scores from gamesHistory
              // If we have eastParticipantId and westParticipantId, use them to map correctly
              let team1Score = 0;
              let team2Score = 0;
              
              if (body.eastParticipantId && body.westParticipantId) {
                // We know which participant was on which side
                for (const game of body.gamesHistory) {
                  if (game.winner === 'east') {
                    // East won this game - check if east was team1 or team2
                    if (body.eastParticipantId === team1Player.participantId) {
                      team1Score++;
                    } else {
                      team2Score++;
                    }
                  } else if (game.winner === 'west') {
                    // West won this game
                    if (body.westParticipantId === team1Player.participantId) {
                      team1Score++;
                    } else {
                      team2Score++;
                    }
                  }
                }
              } else {
                // Fallback: assume team1=east, team2=west (may be incorrect if sides swapped)
                for (const game of body.gamesHistory) {
                  if (game.winner === 'east') team1Score++;
                  else if (game.winner === 'west') team2Score++;
                }
              }
              
              // Determine actual winner based on score
              if (team1Score > team2Score) {
                actualWinnerParticipantId = team1Player.participantId;
                actualLoserParticipantId = team2Player.participantId;
              } else {
                actualWinnerParticipantId = team2Player.participantId;
                actualLoserParticipantId = team1Player.participantId;
              }
              
              req.log.info({ 
                matchId, 
                team1Score, 
                team2Score,
                team1ParticipantId: team1Player.participantId,
                team2ParticipantId: team2Player.participantId,
                actualWinnerParticipantId,
                actualLoserParticipantId,
                bodyWinnerParticipantId: body.winnerParticipantId
              }, 'Calculated scores and winner from games history');

              createdMatchId = addMatch(
                team1Score,
                team2Score,
                [team1Uuid],
                [team2Uuid],
                0, // team1RankingDelta - ranking updated separately for tournaments
                0, // team2RankingDelta
                tournamentId,
                match.roundNumber === 1 ? 'semifinal' : (match.roundPosition === 1 ? 'final' : 'bronze'),
              );

              // Link tournament match with the Match ID
              if (createdMatchId) {
                linkTournamentMatchResult(matchId, createdMatchId);
                req.log.info({ matchId, createdMatchId, team1Score, team2Score }, 'Created and linked Match record for tournament match');
              }
            }
          } catch (error) {
            req.log.error({ error }, 'Failed to create Match record for tournament match');
            // Don't fail the entire request if Match creation fails
          }
        } else {
          req.log.warn({ 
            matchId,
            hasWinnerUuid: !!body.winnerUserUuid,
            hasLoserUuid: !!body.loserUserUuid,
            hasGamesHistory: !!body.gamesHistory,
            gamesHistoryLength: body.gamesHistory?.length || 0
          }, 'Skipping Match creation - missing required data');
        }

        // Update match status to completed AFTER creating Match record to ensure matchId is set
        const updated = updateTournamentMatchStatus(matchId, 'completed', { setCompletedAt: true });
        if (!updated) return res.status(500).send({ message: 'Failed to update match status' });

        let progression: MatchProgression | undefined;
        const participantStatusUpdates: Array<{ participantId: number; status: string }> = [];
        let tournamentUpdate: ReturnType<typeof markTournamentCompleted> | undefined;

        if (match.roundNumber === 1) {
          // Use actual winner from score calculation if available, fallback to body
          const winnerForProgression = actualWinnerParticipantId ?? body.winnerParticipantId;
          const loserForProgression = actualLoserParticipantId ?? body.loserParticipantId;
          
          progression = processSemifinalResult(matchId, {
            manualResult: {
              winnerParticipantId: winnerForProgression,
              loserParticipantId: loserForProgression,
            },
          });
          if (progression?.readyMatches?.length) {
            await notifyMatchesReady(tournamentId, progression.readyMatches);
          }
          
          // Check if only one participant remains (others forfeited/eliminated)
          const autoWinner = checkAndAutoCompleteTournament(tournamentId);
          if (autoWinner) {
            req.log.info({ tournamentId, winnerId: autoWinner }, 'Tournament auto-completed with single remaining participant');
          }
        } else if (match.roundNumber === 2) {
          const applyStatusUpdate = (participantId: number, status: string) => {
            const participant = updateTournamentParticipant(participantId, { status });
            if (!participant) throw new Error('Failed to update participant status');
            participantStatusUpdates.push({ participantId: participant.id, status: participant.status });
          };

          try {
            // Use actual winner from score calculation if available, fallback to body
            const finalWinner = actualWinnerParticipantId ?? body.winnerParticipantId;
            const finalLoser = actualLoserParticipantId ?? body.loserParticipantId;
            
            if (match.roundPosition === 1) {
              applyStatusUpdate(finalWinner, 'champion');
              applyStatusUpdate(finalLoser, 'silver');
            } else if (match.roundPosition === 2) {
              applyStatusUpdate(finalWinner, 'third_place');
              applyStatusUpdate(finalLoser, 'eliminated');
            }
          } catch (error) {
            req.log.error(
              { error },
              'Failed to update participant status after tournament result',
            );
            return res.status(500).send({ message: 'Failed to update participant status' });
          }

          const finalMatch = getTournamentMatchByRoundAndPosition(tournamentId, 2, 1);
          const bronzeMatch = getTournamentMatchByRoundAndPosition(tournamentId, 2, 2);

          if (finalMatch?.status === 'completed' && bronzeMatch?.status === 'completed') {
            tournamentUpdate = markTournamentCompleted(tournamentId);
            if (!tournamentUpdate) {
              const fallback = updateTournamentStatus(tournamentId, 'completed');
              if (fallback) tournamentUpdate = fallback;
            }
          }
        }

        await notifyTournamentStateUpdated(tournamentId);

        const responsePayload: Record<string, unknown> = {
          match: updated,
          progression: progression ?? null,
        };

        if (participantStatusUpdates.length) {
          responsePayload.participantStatusUpdates = participantStatusUpdates;
        }

        if (tournamentUpdate) {
          responsePayload.tournament = tournamentUpdate;
        }

        return res.status(200).send(responsePayload);
      } catch (error) {
        req.log.error({ error }, 'Failed to report tournament match result');
        return res.status(500).send({ message: 'Failed to report tournament match result' });
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
          if (bracketSummary.readyMatches?.length)
            await notifyMatchesReady(tournamentId, bracketSummary.readyMatches);
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

        const tournament = getTournamentById(tournamentId);
        if (!tournament) return res.status(404).send({ message: 'Tournament not found' });

        const participantsBefore = listTournamentParticipants(tournamentId);
        const wasOnlyParticipant =
          participantsBefore.length === 1 && participantsBefore[0]?.id === participantId;
        const tournamentMatches = wasOnlyParticipant ? listTournamentMatches(tournamentId) : [];
        const hasCompletedMatches = tournamentMatches.some(
          (match) => match.completedAt !== null || match.status === 'completed',
        );

        // If tournament has started (active/completed), mark as forfeited instead of deleting
        // This preserves bracket history and final standings
        if (tournament.status === 'active' || tournament.status === 'completed') {
          const updated = updateTournamentParticipant(participantId, { status: 'forfeited' });
          if (!updated) return res.status(500).send({ message: 'Failed to mark participant as forfeited' });
          
          req.log.info({ tournamentId, participantId, alias: existing.alias }, 'Participant marked as forfeited');
        } else {
          // Tournament hasn't started yet (draft), safe to delete
          const removed = removeTournamentParticipant(participantId);
          if (!removed) return res.status(500).send({ message: 'Failed to remove participant' });
        }

        if (wasOnlyParticipant && !hasCompletedMatches) {
          const cancelled = updateTournamentStatus(tournamentId, 'cancelled');
          if (!cancelled) {
            req.log.warn(
              { tournamentId },
              'Failed to mark tournament cancelled after last participant left',
            );
          }
        } else {
          // Check if only one participant remains after this removal/forfeit
          const autoWinner = checkAndAutoCompleteTournament(tournamentId);
          if (autoWinner) {
            req.log.info({ tournamentId, winnerId: autoWinner }, 'Tournament auto-completed after participant removal');
          }
        }

        await notifyTournamentStateUpdated(tournamentId);
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
          if (progression?.readyMatches?.length) {
            await notifyMatchesReady(tournamentId, progression.readyMatches);
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
