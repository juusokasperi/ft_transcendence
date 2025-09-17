import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import db from '../db/client.ts';
import { getUserStats, updateUserRanking } from '../db/queries/users.ts';
import { addGame } from '../db/queries/games.ts';
import { gameAuthPreHandler } from '../hooks/auth.ts';
import { addGameSchema } from '../schemas/gamesSchemas.ts';

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
  gameResult: 'win' | 'loss' | 'draw',
  tournamentStage?: string,
): number {
  const baseK = 32;
  const tournamentMultiplier = getTournamentMultiplier(tournamentStage);
  const K = baseK * tournamentMultiplier;

  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  let actualScore: number;
  if (gameResult === 'win') actualScore = 1;
  else if (gameResult === 'loss')
    actualScore = 0; // For Draw
  else actualScore = 0.5;

  return Math.round(K * (actualScore - expectedScore));
}

export async function gamesRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: addGameSchema,
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
        if (team1Stats.length !== team1Players.length || team2Stats.length !== team2Players.length)
          throw new Error('One or more players not found in database');

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

        const gameId = addGame(
          team1Score,
          team2Score,
          team1Players,
          team2Players,
          team1Points,
          team2Points,
          tournamentId,
          tournamentStage,
        );
        if (!gameId) throw new Error('Failed to create game');
        for (let i = 0; i < team1Players.length; ++i) {
          const newRanking = team1Stats[i]!.ranking + team1Points;
          if (!updateUserRanking(team1Players[i], newRanking))
            throw new Error(`Failed to update ranking for player ${team1Players[i]}`);
        }

        for (let i = 0; i < team2Players.length; ++i) {
          const newRanking = team2Stats[i]!.ranking + team2Points;
          if (!updateUserRanking(team2Players[i], newRanking))
            throw new Error(`Failed to update ranking for player ${team2Players[i]}`);
        }

        return {
          gameId,
          eloChanges: { team1: team1Points, team2: team2Points },
        };
      });

      try {
        const result = transaction();
        return res.status(200).send({ message: 'Game successfully added to database', ...result });
      } catch (error) {
        console.error('Transaction failed:', error);
        return res.status(500).send({
          message: 'Failed to add game results to database',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );
}
