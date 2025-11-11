import { ADMIN_SECRET, PORT, REDIS_URL, IDEMPOTENCY_PREFIX } from './utils/config.ts';
import fastify from 'fastify';
import { v4 as uuid } from 'uuid';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { signJoinToken } from '@pong/shared/auth/tokenSign';
import type { JoinTokenClaims, TournamentContext } from '@pong/shared/protocol/net';
import axios from 'axios';
import Redis from 'ioredis';
import { AllocateSchema } from './utils/schema.ts';
import { registerMetrics } from '@utils/metrics';
import { log } from '@utils/logger';

const redis = new Redis(REDIS_URL);

const app = fastify();

registerMetrics(app, { labels: { service: 'allocator' } });

app.post(
  '/allocate',
  {
    schema: AllocateSchema,
  },
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { idempotencyKey, mode, players, randomSeed, simulationStartTick, tournament } =
        request.body as {
          idempotencyKey: string;
          mode: 'ranked' | 'tournament' | 'invite';
          players: Array<{
            playerIdentifier: string;
            side: 'west' | 'east';
            tournamentParticipantId?: number;
            alias?: string;
            mmr: number;
          }>;
          simulationStartTick: number;
          randomSeed: number;
          tournament?: TournamentContext;
        };

      const cached = await redis.get(IDEMPOTENCY_PREFIX + idempotencyKey);
      if (cached) {
        log('Idempotency cache hit', {
          idempotencyKey,
          cached: JSON.parse(cached),
        });
        return reply.send(JSON.parse(cached));
      }

      const roomIdentifier = `r-${uuid()}`;
      const joinDeadlineAtEpochMs = Date.now() + 15000;

      const nodeScores = await redis.hgetall('game-node:scores');
      let bestScore = Infinity;
      let bestNodeInfo = null;
      for (const value of Object.values(nodeScores)) {
        const nodeInfo = JSON.parse(value as string);
        if (typeof nodeInfo.score === 'number' && nodeInfo.score < bestScore) {
          bestScore = nodeInfo.score;
          bestNodeInfo = nodeInfo;
        }
      }

      if (!bestNodeInfo) {
        log('No available game nodes', { idempotencyKey }, 'error');
        return reply.status(503).send({ message: 'No available game nodes' });
      }

      const nodeUrl = `${bestNodeInfo.http}`;
      const wsNodeUrl = `${bestNodeInfo.ws}`;
      await redis.set(`room-to-node:${roomIdentifier}`, wsNodeUrl, 'EX', 900);

      try {
        await axios.post(
          `${nodeUrl}/admin/rooms`,
          {
            idempotencyKey,
            roomIdentifier,
            capacity: players.length,
            expectedPlayers: players,
            randomSeed,
            simulationStartTick,
            joinDeadlineAtEpochMs,
            tournament,
          },
          {
            headers: {
              'X-Admin-Secret': ADMIN_SECRET,
            },
          },
        );
      } catch (err) {
        log(
          'Failed to allocate a game server',
          { error: err instanceof Error ? err.message : 'Unknown error' },
          'error',
        );
        return reply.status(503).send({ message: "Server's are busy." });
      }

      const perPlayerJoinTokens: Record<string, string> = {};
      const nowSec = Math.floor(Date.now() / 1000);
      const expSec = nowSec + 60;
      for (const p of players) {
        const claims: JoinTokenClaims = {
          iss: 'mm',
          aud: 'game-node',
          iat: nowSec,
          exp: expSec,
          jti: uuid(),
          roomIdentifier,
          sub: p.playerIdentifier,
          side: p.side,
          simulationStartTick,
        };
        if (mode === 'tournament' && tournament) {
          claims.tournamentId = tournament.tournamentId;
          claims.tournamentMatchId = tournament.tournamentMatchId;
          claims.tournamentStage = tournament.tournamentStage;
        }
        perPlayerJoinTokens[p.playerIdentifier] = signJoinToken(claims);
      }

      const endpointUrl = `/g/${roomIdentifier}`;
      const response = {
        roomIdentifier,
        endpointUrl,
        perPlayerJoinTokens,
      };
      if (!cached) {
        log('Allocated new room', {
          idempotencyKey,
          roomIdentifier,
          players,
          endpointUrl,
        });
      }
      await redis.set(IDEMPOTENCY_PREFIX + idempotencyKey, JSON.stringify(response), 'EX', 300);

      return reply.send(response);
    } catch (err) {
      log(
        'Error in /allocate',
        {
          error: err instanceof Error ? err.message : 'Unknown error',
          idempotencyKey: (request.body as { idempotencyKey?: string })?.idempotencyKey,
          requestBody: request.body,
        },
        'error',
      );
      return reply.status(500).send({ message: 'Internal server error' });
    }
  },
);

app.listen({ port: PORT, host: '0.0.0.0' }, (err: Error | null) => {
  if (err) throw err;
  log(`Server started on port ${PORT}`);
});
