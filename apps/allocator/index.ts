import { log } from './utils/log.ts';
import { GAME_SERVER_URL, PORT, REDIS_URL, IDEMPOTENCY_PREFIX } from './utils/config.ts';
import fastify from 'fastify';
import { v4 as uuid } from 'uuid';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { signJoinToken } from '@pong/shared/auth/tokenSign';
import type { JoinTokenClaims } from '@pong/shared/protocol/net';
import axios from 'axios';
import Redis from 'ioredis';

const redis = new Redis(REDIS_URL);

const app = fastify();

type RoomInfo = {
  roomIdentifier: string,
  perPlayerJoinTokens: Record<string, string>;
  endpointUrl: string;
};
//Replace with Redis
const idempotencyMap = new Map<string, RoomInfo>();

app.post('/allocate', async (request: FastifyRequest, reply: FastifyReply) => {
  const {
    idempotencyKey,
    mode,
    region,
    players,
    randomSeed,
    simulationStartTick
  } = request.body as
  {
    idempotencyKey: string;
    mode: string;
    region: string;
    players: Array<{playerIdentifier: string; side: 'west' | 'east' }>;
    simulationStartTick: number;
    randomSeed: number;
  };

  const cached = await redis.get(IDEMPOTENCY_PREFIX + idempotencyKey);
  if (cached)
    return JSON.parse(cached);

  const roomIdentifier = `r-${uuid()}`;
  const joinDeadlineAtEpochMs = Date.now() + 15000;

  await axios.post(
    `${GAME_SERVER_URL.replace(/^ws/, 'http')}/admin/rooms`,
    {
      idempotencyKey,
      roomIdentifier,
      capacity: players.length,
      expectedPlayers: players,
      randomSeed,
      simulationStartTick,
      joinDeadlineAtEpochMs,
    }
  );

  const perPlayerJoinTokens: Record<string, string> = {};
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + 60;
  for (const p of players) {
    const claims: JoinTokenClaims = {
      iss: 'mm',
      iat: nowSec,
      exp: expSec,
      jti: uuid(),
      roomIdentifier,
      sub: p.playerIdentifier,
      side: p.side,
      simulationStartTick,
    }
    perPlayerJoinTokens[p.playerIdentifier] = signJoinToken(claims);
  }

  const endpointUrl = `${GAME_SERVER_URL}/g/${roomIdentifier}`;
  const response = {
    roomIdentifier,
    endpointUrl,
    perPlayerJoinTokens
  };
  await redis.set(IDEMPOTENCY_PREFIX + idempotencyKey, JSON.stringify(response), 'EX', 300);

  return response;
});

app.listen({ port: PORT }, (err: Error | null, address: string) => {
  if (err) throw err;
  console.log(`Allocator server listening on ${PORT}`);
  log(`Server started on port ${PORT}`);
});

