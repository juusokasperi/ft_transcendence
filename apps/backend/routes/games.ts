import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUser, getUserStats } from '../db/queries/users.ts';
import { addGame } from '../db/queries/games.ts';
import { authPreHandler, tokenUuidCheck } from '../hooks/auth.ts';
import { updateLastSeenHandler } from '../hooks/updateLastSeen.ts';

function getTournamentMultiplier(tournamentStage?: string): number {
  if (!tournamentStage) return 1.0;

  // Add stuff here, so the awarded points can be different based on the tournament stage
  const multipliers: Record<string, number> = {
    'semifinal': 2.0,
    'final': 3.0
  };
  return multipliers[tournamentStage] || 1.0;
}

function calculateEloChange(
  winnerElo: number,
  loserElo: number,
  isWinner: boolean,
  tournamentStage?: string
): number {
  const baseK = 32;
  const tournamentMultiplier = getTournamentMultiplier(tournamentStage);
  const K = baseK * tournamentMultiplier;

  const expectedScore = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const actualScore = isWinner ? 1 : 0;
  return Math.round(K * (actualScore - expectedScore));
}

/*
  JWT Secret? To be implemented.

  Req body must contain:
    Team 1 Players:
      { player1Id: string; player2Id?: string; }
    Team 2 Players:
      { player1Id: string; player2Id?: string; }
    Team 1 Score
    Team 2 Score

    Left for later implementation
      Tournament info
        We could add a simple Tournaments table, that contains at least id and createdBy
      Each Games -entry would have optional tournament_id and tournament_stage entry.
*/
export async function gamesRoutes(app: FastifyInstance) {
  app.post(
    '/',
  {
    //schema: gamesSchema,
    //preHandler: [gameSecretHandler]
  },
  async (req: FastifyRequest, res: FastifyReply) => {
    try {
        const { team1Players, team2Players, team1Score, team2Score, tournamentId, tournamentStage } = req.body as {
          team1Players: string[];
          team2Players: string[];
          team1Score: number;
          team2Score: number;
          tournamentId?: string;
          tournamentStage?: string;
        };

        const team1Stats = await Promise.all(team1Players.map(id => getUserStats(id)));
        const team2Stats = await Promise.all(team2Players.map(id => getUserStats(id)));
        const team1AvgElo = team1Stats.reduce((sum, stats) => sum + (stats!.ranking), 0) / team1Stats.length;
        const team2AvgElo = team2Stats.reduce((sum, stats) => sum + (stats!.ranking), 0) / team2Stats.length;

        const team1Won = team1Score > team2Score;
        const team1EloChange = calculateEloChange(team1AvgElo, team2AvgElo, team1Won, tournamentStage);
        const team2EloChange = calculateEloChange(team2AvgElo, team1AvgElo, !team1Won, tournamentStage);
        const team1Points = Math.max(1, 10 + team1EloChange);
        const team2Points = Math.max(1, 10 + team2EloChange);

        const gameId = addGame(
          team1Score,
          team2Score,
          team1Players,
          team2Players,
          team1Points,
          team2Points,
          tournamentId,
          tournamentStage
        );

    } catch {
      return res.status(500).send({ message: 'Failed to add game results to database' });
    }
  });
};
