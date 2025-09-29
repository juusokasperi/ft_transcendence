import type { ClientInfo, MatchMode, PendingMatch } from '../types/types';
import { v4 as uuid } from 'uuid';
import { JOIN_TOKEN_TTL_SECONDS, ALLOCATOR_URL } from './config';
import { log } from './log';
import axios from 'axios';
import { isAuthenticated } from '../auth/auth';
import { handleHandoff } from './pendingHandoffs';

const queue: ClientInfo[] = [];

export function tryMatchQueue(pendingMatches: Map<string, PendingMatch>) {
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
        log('Pair found in queue', { a: a.uuid, b: b.uuid, window });
        addToPendingMatches(a, b, pendingMatches);
        return;
      }
    }
  }
}

export function handleLeaveQueue(client: ClientInfo) {
  if (removeFromQueue(client.id)) {
    client.socket.send(JSON.stringify({ type: 'QUEUE_LEFT' }));
    log('Client left queue', { uuid: client.uuid, queueSize: queue.length });
  }
}

export async function handleJoinQueue(client: ClientInfo) {
  if (!isAuthenticated(client)) return;
  client.joinedAt = Date.now();
  queue.push(client);
  log(`Client joined queue`, { uuid: client.uuid, queueSize: queue.length });
  client.socket.send(JSON.stringify({ type: 'QUEUE_JOINED' }));
}

export function addToPendingMatches(
  a: ClientInfo,
  b: ClientInfo,
  pendingMatches: Map<string, PendingMatch>,
) {
  const matchId = uuid();
  const accepted = new Set<string>();
  const timer = setTimeout(() => {
    const msg = { type: 'MATCH_TIMEOUT', matchId };
    a.socket.send(JSON.stringify(msg));
    b.socket.send(JSON.stringify(msg));
    pendingMatches.delete(matchId);
    log('Match timed out waiting for accepts', {
      matchId,
      accepted: Array.from(accepted),
    });
    if (accepted.has(a.id)) handleJoinQueue(a);
    if (accepted.has(b.id)) handleJoinQueue(b);
  }, 15000);

  pendingMatches.set(matchId, { a, b, accepted, timer });
  log('Match found awaiting confirmation', { matchId, players: [a.uuid, b.uuid] });
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
  log(`Match accepted`, { matchId, uuid: client.uuid });
  if (match.accepted.has(match.a.id) && match.accepted.has(match.b.id)) {
    clearTimeout(match.timer);
    pendingMatches.delete(matchId);
    try {
      log('Both players accepted math', { matchId });
      createMatch(match.a, match.b, 'ranked');
    } catch (err) {
      log('Failed to create a match', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      client.socket.close();
    }
  }
}

export function handleDeclineMatch(
  matchId: string,
  client: ClientInfo,
  pendingMatches: Map<string, PendingMatch>,
) {
  const match = pendingMatches.get(matchId);
  if (!match) return;
  const msg = { type: 'MATCH_DECLINED', matchId };
  log(`Player declined match`, { matchId, uuid: client.uuid });
  if (match.a.id !== client.id) {
    match.a.socket.send(JSON.stringify(msg));
    handleJoinQueue(match.a);
  }
  if (match.b.id !== client.id) {
    match.b.socket.send(JSON.stringify(msg));
    handleJoinQueue(match.b);
  }
  clearTimeout(match.timer);
  pendingMatches.delete(matchId);
}

export async function createMatch(a: ClientInfo, b: ClientInfo, mode: MatchMode) {
  const matchId = uuid();
  const randomSeed = Math.floor(Math.random() * 0x100000000);
  const simulationStartTick = Date.now() + 5000;

  let allocatorRes;
  try {
    log('Requesting allocation', {
      matchId,
      players: [a.uuid, b.uuid],
      randomSeed,
      simulationStartTick,
    });

    allocatorRes = await axios.post(`${ALLOCATOR_URL}/allocate`, {
      idempotencyKey: matchId,
      mode,
      region: 'default',
      players: [
        { playerIdentifier: a.uuid, side: 'west' },
        { playerIdentifier: b.uuid, side: 'east' },
      ],
      randomSeed,
      simulationStartTick,
    });
  } catch (err) {
    log('Allocator failed, sending error msg to client', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
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
        joinToken: perPlayerJoinTokens[player.uuid],
        joinTokenTTLSeconds: JOIN_TOKEN_TTL_SECONDS,
        randomSeed,
        simulationStartTick,
      }),
    );
    handleHandoff(perPlayerJoinTokens, matchId, mode);
  });
  log(`Match created`, {
    matchId,
    playerA: { username: a.username, uuid: a.uuid },
    playerB: { username: b.username, uuid: b.uuid },
  });
}

export function removeFromQueue(id: string): boolean {
  const idx = queue.findIndex((c) => c.id === id);
  if (idx !== -1) {
    queue.splice(idx, 1);
    return true;
  }
  return false;
}

export function clearQueue() {
  queue.length = 0;
}
