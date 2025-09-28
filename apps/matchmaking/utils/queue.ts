import type { ClientInfo, PendingMatch } from '../types/types.ts';
import { v4 as uuid } from 'uuid';
import { JOIN_TOKEN_TTL_SECONDS, ALLOCATOR_URL } from './config.ts';
import { log } from './log.ts';
import axios from 'axios';
import { isAuthenticated } from '../auth/auth.ts';

export function tryMatchQueue(queue: ClientInfo[], pendingMatches: Map<string, PendingMatch>) {
  queue.sort((a, b) => a.joinedAt - b.joinedAt);
  for (let i = 0; i < queue.length; ++i) {
    const a = queue[i]!;
    const waitedMs = Date.now() - a.joinedAt;
    const window = Math.min(500, 50 + Math.floor(waitedMs / 2500) * 50);
    for (let j = i + 1; j < queue.length; ++j) {
      const b = queue[j]!;
      if (Math.abs(a.mmr - b.mmr) <= window) {
        queue.splice(j, 1);
        queue.splice(i, 1);
        addToPendingMatches(a, b, pendingMatches, queue);
        return;
      }
    }
  }
}

export function handleLeaveQueue(client: ClientInfo, queue: ClientInfo[]) {
  const idx = queue.findIndex((c) => c.id === client.id);
  if (idx !== -1) {
    queue.splice(idx, 1);
    client.socket.send(JSON.stringify({ type: 'QUEUE_LEFT' }));
  }
}

export async function handleJoinQueue(client: ClientInfo, queue: ClientInfo[]) {
  if (!isAuthenticated(client)) return;
  client.joinedAt = Date.now();
  queue.push(client);
  client.socket.send(JSON.stringify({ type: 'QUEUE_JOINED' }));
}

export function addToPendingMatches(
  a: ClientInfo,
  b: ClientInfo,
  pendingMatches: Map<string, PendingMatch>,
  queue: ClientInfo[],
) {
  const matchId = uuid();
  const accepted = new Set<string>();
  const timer = setTimeout(() => {
    const msg = { type: 'MATCH_TIMEOUT', matchId };
    a.socket.send(JSON.stringify(msg));
    b.socket.send(JSON.stringify(msg));
    pendingMatches.delete(matchId);
    if (accepted.has(a.id)) handleJoinQueue(a, queue);
    if (accepted.has(b.id)) handleJoinQueue(b, queue);
  }, 15000);

  pendingMatches.set(matchId, { a, b, accepted, timer });
  const msgA = { type: 'MATCH_FOUND', matchId, opponent: { username: b.username, mmr: b.mmr } };
  const msgB = { type: 'MATCH_FOUND', matchId, opponent: { username: a.username, mmr: a.mmr } };
  a.socket.send(JSON.stringify(msgA));
  b.socket.send(JSON.stringify(msgB));
}

export function handleAcceptMatch(
  matchId: string,
  client: ClientInfo,
  pendingMatches: Map<string, PendingMatch>,
) {
  const match = pendingMatches.get(matchId);
  if (!match) return;
  match.accepted.add(client.id);
  if (match.accepted.has(match.a.id) && match.accepted.has(match.b.id)) {
    clearTimeout(match.timer);
    pendingMatches.delete(matchId);
    try {
      createMatch(match.a, match.b);
    } catch (err) {
      log('Failed to create a match', err);
      client.socket.close();
    }
  }
}

export function handleDeclineMatch(
  matchId: string,
  client: ClientInfo,
  pendingMatches: Map<string, PendingMatch>,
  queue: ClientInfo[],
) {
  const match = pendingMatches.get(matchId);
  if (!match) return;
  const msg = { type: 'MATCH_DECLINED', matchId };
  if (match.a.id !== client.id) {
    match.a.socket.send(JSON.stringify(msg));
    handleJoinQueue(match.a, queue);
  }
  if (match.b.id !== client.id) {
    match.b.socket.send(JSON.stringify(msg));
    handleJoinQueue(match.b, queue);
  }
  clearTimeout(match.timer);
  pendingMatches.delete(matchId);
}

export async function createMatch(a: ClientInfo, b: ClientInfo) {
  const matchId = uuid();
  const randomSeed = Math.floor(Math.random() * 0x100000000);
  const simulationStartTick = Date.now() + 5000;

  let allocatorRes;
  try {
    allocatorRes = await axios.post(`${ALLOCATOR_URL}/allocate`, {
      idempotencyKey: matchId,
      mode: 'ranked',
      region: 'default',
      players: [
        { playerIdentifier: a.id, side: 'west' },
        { playerIdentifier: b.id, side: 'east' },
      ],
      randomSeed,
      simulationStartTick,
    });
  } catch (err) {
    log('Allocator failed, sending error msg to client');
    const msg = {
      type: 'ERROR',
      code: 'ALLOCATOR',
      message: 'Game servers are currently busy, try again later.',
    };
    a.socket.send(JSON.stringify(msg));
    b.socket.send(JSON.stringify(msg));
    return;
  }

  const { roomIdentifier, endpointUrl, perPlayerJoinTokens } = allocatorRes!.data;

  [a, b].forEach((player, idx) => {
    const side = idx === 0 ? 'west' : 'east';
    player.socket.send(
      JSON.stringify({
        type: 'HANDOFF',
        matchId,
        roomIdentifier,
        gameServerWSUrl: endpointUrl,
        side,
        joinToken: perPlayerJoinTokens[player.id],
        joinTokenTTLSeconds: JOIN_TOKEN_TTL_SECONDS,
        randomSeed,
        simulationStartTick,
      }),
    );
  });
  log(`Match created: ${matchId} (${a.username} vs ${b.username})`);
}
