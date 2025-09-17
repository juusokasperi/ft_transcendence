import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { UserStats } from '../types/types.ts';
import db from '../db/client.ts';
import { getUserStats, updateUserRanking } from '../db/queries/users.ts';
import {
  addMatch,
  getMatchesWithPlayersForUser,
  getMatchWithPlayers,
} from '../db/queries/matches.ts';
import { authPreHandler, gameAuthPreHandler, tokenUuidCheck } from '../hooks/auth.ts';
import { addMatchSchema, getMatchSchema, getMyMatchesSchema } from '../schemas/matchSchemas.ts';

/*
The service calling this route must include a jwt token with GAME_SECRET

Req body must contain:
Team 1 Players: string[]
Team 2 Players: string[]
Team 1 Score
Team 2 Score
Optional tournamentI and tournamentStage

Left for later implementation;
We could add a simple Tournaments table, that contains at least id and createdBy
*/

// Different stages of tournament can affect ELO rating more
function getTournamentMultiplier(tournamentStage?: string): number {
  if (!tournamentStage) return 1.0;

  // Add stuff here, so the awarded points can be different based on the tournament stage
  const multipliers: Record<string, number> = {
    quarterfinal: 1.15,
    semifinal: 1.25,
    final: 1.5,
  };
  return multipliers[tournamentStage] || 1.0;
}

function calculateEloChange(
  playerElo: number,
  opponentElo: number,
  matchResult: 'win' | 'loss' | 'draw',
  tournamentStage?: string,
): number {
  const baseK = 32;
  const tournamentMultiplier = getTournamentMultiplier(tournamentStage);
  const K = baseK * tournamentMultiplier;

  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  let actualScore: number;
  if (matchResult === 'win') actualScore = 1;
  else if (matchResult === 'loss') actualScore = 0;
  else actualScore = 0.5;

  return Math.round(K * (actualScore - expectedScore));
}

function updateTeamRanking(players: string[], stats: (UserStats | null)[], points: number): void {
  for (let i = 0; i < players.length; ++i) {
    const playerId = players[i];
    if (!playerId) throw new Error(`Player at index ${i} is undefined`);

    const playerStats = stats[i];
    if (!playerStats) throw new Error(`Stats for player at index ${i} is null`);

    const newRanking = playerStats.ranking + points;
    if (!updateUserRanking(playerId, newRanking))
      throw new Error(`Failed to update ranking for player ${players[i]}`);
  }
}

export async function matchRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: addMatchSchema,
      preHandler: [gameAuthPreHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      const transaction = db.transaction(() => {
        const {
          team1Players,
          team2Players,
          team1Score,
          team2Score,
          tournamentId,
          tournamentStage,
        } = req.body as {
          team1Players: string[];
          team2Players: string[];
          team1Score: number;
          team2Score: number;
          tournamentId?: number;
          tournamentStage?: string;
        };

        const team1Stats = team1Players.map((id) => getUserStats(id));
        const team2Stats = team2Players.map((id) => getUserStats(id));
        const hasNullStats = [...team1Stats, ...team2Stats].some((stat) => stat === null);
        if (hasNullStats) throw new Error('One or more players not found in database');

        const team1AvgElo =
          team1Stats.reduce((sum, stats) => sum + stats!.ranking, 0) / team1Stats.length;
        const team2AvgElo =
          team2Stats.reduce((sum, stats) => sum + stats!.ranking, 0) / team2Stats.length;

        let team1Result: 'win' | 'loss' | 'draw';
        let team2Result: 'win' | 'loss' | 'draw';
        if (team1Score > team2Score) {
          team1Result = 'win';
          team2Result = 'loss';
        } else if (team2Score > team1Score) {
          team1Result = 'loss';
          team2Result = 'win';
        } else {
          team1Result = 'draw';
          team2Result = 'draw';
        }
        const team1Points = calculateEloChange(
          team1AvgElo,
          team2AvgElo,
          team1Result,
          tournamentStage,
        );
        const team2Points = calculateEloChange(
          team2AvgElo,
          team1AvgElo,
          team2Result,
          tournamentStage,
        );

        const matchId = addMatch(
          team1Score,
          team2Score,
          team1Players,
          team2Players,
          team1Points,
          team2Points,
          tournamentId,
          tournamentStage,
        );
        if (!matchId) throw new Error('Failed to create match');
        updateTeamRanking(team1Players, team1Stats, team1Points);
        updateTeamRanking(team2Players, team2Stats, team2Points);
        return {
          matchId,
          eloChanges: { team1: team1Points, team2: team2Points },
        };
      });

      try {
        const result = transaction();
        return res.status(200).send({ message: 'Match successfully added to database', ...result });
      } catch (error) {
        console.error('Transaction failed:', error);
        return res.status(500).send({
          message: 'Failed to add match results to database',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  app.get(
    '/:matchId',
    {
      schema: getMatchSchema,
      preHandler: [authPreHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { matchId } = req.params as { matchId: number };
        const result = getMatchWithPlayers(matchId);
        if (!result) {
          res.status(404).send({ message: 'Match ID not found' });
          return;
        }
        return res.status(200).send(result);
      } catch (error) {
        console.error('GET /matches/:matchId failed:', error);
        return res.status(500).send({ message: 'Failed to get match data from DB' });
      }
    },
  );

  app.get(
    '/',
    {
      schema: getMyMatchesSchema,
      preHandler: [authPreHandler, tokenUuidCheck],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid; // set by authPreHandler
        const { count, offset } = req.query as { count?: number; offset?: number };
        let results;
        results = getMatchesWithPlayersForUser(uuid, count, offset);
        return res.status(200).send(results);
      } catch (error) {
        console.error('GET /matches failed:', error);
        return res.status(500).send({ message: 'Failed to fetch match data for user' });
      }
    },
  );
}
