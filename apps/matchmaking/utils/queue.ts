import type { ClientInfo, PendingMatch } from '../types/types.ts';
import { v4 as uuid } from 'uuid';
import { signJoinToken } from '../../../packages/pong/shared/src/auth/tokenSign.ts'; // fix this import
import { GAME_SERVER_URL, JOIN_TOKEN_TTL_SECONDS } from './config.ts';
import { log } from './log.ts';
import { handleJoinQueue } from './handlers.ts';

export function tryMatchQueue(queue: ClientInfo[], pendingMatches: Map<string, PendingMatch>) {
  queue.sort((a, b) => a.joinedAt - b.joinedAt);
  for (let i = 0; i < queue.length; ++i) {
    const a = queue[i]!;
    const waitedMs = Date.now() - a.joinedAt;
    const window = 100 + Math.floor(waitedMs / 2500) * 50;
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
    createMatch(match.a, match.b);
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

export function createMatch(a: ClientInfo, b: ClientInfo) {
  const matchId = uuid();
  const roomId = uuid();
  const randomSeed = Math.floor(Math.random() * 0x100000000);
  const simulationStartTick = Date.now() + 5000;
  [a, b].forEach((player, idx) => {
    const claims = {
      jti: uuid(),
      exp: Math.floor(Date.now() / 1000) + 45,
      roomId,
      side: idx === 0 ? ('west' as 'west') : ('east' as 'east'),
      startTick: simulationStartTick,
      randomSeed,
      mmTicket: matchId,
    };
    const joinToken = signJoinToken(claims);
    player.socket.send(
      JSON.stringify({
        type: 'HANDOFF',
        matchId,
        roomId,
        gameServerWSUrl: GAME_SERVER_URL,
        side: claims.side,
        joinToken,
        joinTokenTTLSeconds: JOIN_TOKEN_TTL_SECONDS,
        randomSeed,
        simulationStartTick,
      }),
    );
  });
  log(`Match created: ${matchId} (${a.username} vs ${b.username})`);
}
