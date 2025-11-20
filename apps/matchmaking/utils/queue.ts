import { ClientState, type ClientInfo, type MatchMode, type PendingMatch } from '../types/types.ts';
import { v4 as uuid } from 'uuid';
import { JOIN_TOKEN_TTL_SECONDS, ALLOCATOR_URL } from './config.ts';
import { log } from '@utils/logger';
import axios from 'axios';
import { isAuthenticated } from '../auth/auth.ts';
import { handleHandoff } from './pendingHandoffs.ts';
import { setClientState } from './state.ts';

export interface TournamentMatchContext {
  tournamentId: number;
  tournamentMatchId: number;
  tournamentStage: 'semifinal' | 'final' | 'bronze';
  participants?: Array<{ participantId: number; userUuid: string; alias?: string }>;
}

const MMR_BUCKET_SIZE = 50;
const buckets = new Map<number, ClientInfo[]>();

/**
 * Clients are spread into buckets based on MMR. First index of each bucket
 * contains the oldest player in said bucket, so we make an array of those indexes,
 * sort them based on the joinedAt value and start matching.
 * This helps us avoid starvation problem, where f.ex. oldest player has a
 * higher MMR than the rest of the queue potentially blocking from anybody getting matched.
 *
 * @param pendingMatches
 */
export function tryMatchQueue(pendingMatches: Map<string, PendingMatch>) {
  const oldestPlayers: ClientInfo[] = [];
  for (const clients of buckets.values()) {
    if (clients.length > 0 && clients[0]) oldestPlayers.push(clients[0]);
  }
  if (oldestPlayers.length === 0) return;

  oldestPlayers.sort((a, b) => a.joinedAt - b.joinedAt);

  const matchedPlayerIds = new Set<string>();

  for (const a of oldestPlayers) {
    if (matchedPlayerIds.has(a.id)) continue;

    const bucketId = Math.floor(a.mmr / MMR_BUCKET_SIZE);
    const aBucket = buckets.get(bucketId);
    if (!aBucket || aBucket[0]?.id !== a.id) continue;

    const waitedMs = Date.now() - a.joinedAt;
    const window = Math.min(500, MMR_BUCKET_SIZE + Math.floor(waitedMs / 2500) * MMR_BUCKET_SIZE);
    const bucketsToCheck = Math.ceil(window / MMR_BUCKET_SIZE);

    for (let offset = -bucketsToCheck; offset <= bucketsToCheck; ++offset) {
      const searchBucket = buckets.get(bucketId + offset);
      if (!searchBucket) continue;

      const startIdx = offset === 0 ? 1 : 0;
      let matchFound = false;
      for (let i = startIdx; i < searchBucket.length; ++i) {
        const b = searchBucket[i]!;

        if (Math.abs(a.mmr - b.mmr) <= window) {
          aBucket.shift();
          searchBucket.splice(i, 1);

          matchedPlayerIds.add(a.id);
          matchedPlayerIds.add(b.id);

          cleanupBucket(bucketId);
          cleanupBucket(bucketId + offset);

          log('Pair found in queue buckets', {
            a: a.uuid,
            b: b.uuid,
            window,
            totalBuckets: buckets.size,
          });
          addToPendingMatches(a, b, pendingMatches);
          matchFound = true;
          break;
        }
      }
      if (matchFound) break;
    }
  }
}

export function handleLeaveQueue(client: ClientInfo) {
  if (removeFromQueue(client.id)) {
    const targetState = client.previousState ?? ClientState.IDLE;
    client.previousState = undefined;

    setClientState(client, targetState, 'left_queue');
    client.socket.send(JSON.stringify({ type: 'QUEUE_LEFT' }));
    log('Client left queue', { uuid: client.uuid, targetState: ClientState[targetState] });
  }
}

export async function handleJoinConfirm(client: ClientInfo) {
  if (client.state === ClientState.IN_TOURNAMENT || client.state === ClientState.IN_INVITE_LOBBY) {
    client.previousState = client.state;
  }
  handleJoinQueue(client);
}

export async function handleJoinQueue(client: ClientInfo) {
  if (!isAuthenticated(client)) return;

  client.joinedAt = Date.now();
  const bucketId = Math.floor(client.mmr / MMR_BUCKET_SIZE);
  if (!buckets.has(bucketId)) buckets.set(bucketId, []);
  const bucket = buckets.get(bucketId)!;
  bucket.push(client);
  log(`Client joined queue`, {
    uuid: client.uuid,
    bucket: bucketId,
    bucketSize: bucket.length,
    totalBuckets: buckets.size,
  });
  client.socket.send(JSON.stringify({ type: 'QUEUE_JOINED' }));
  setClientState(client, ClientState.IN_QUEUE, 'joined_queue');
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
    if (accepted.has(a.id)) returnToQueue(a);
    else setClientState(a, ClientState.IDLE, 'match_timeout');
    if (accepted.has(b.id)) returnToQueue(b);
    else setClientState(b, ClientState.IDLE, 'match_timeout');
  }, 15000);

  pendingMatches.set(matchId, { a, b, accepted, timer });
  log('Match found awaiting confirmation', { matchId, players: [a.uuid, b.uuid] });
  const msgA = { type: 'MATCH_FOUND', matchId, opponent: { username: b.username, mmr: b.mmr } };
  const msgB = { type: 'MATCH_FOUND', matchId, opponent: { username: a.username, mmr: a.mmr } };
  setClientState(a, ClientState.PENDING_MATCH_ACCEPTANCE, 'match_pending');
  setClientState(b, ClientState.PENDING_MATCH_ACCEPTANCE, 'match_pending');
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
  setClientState(client, ClientState.AWAITING_HANDOFF, 'match_accepted');
  log(`Match accepted`, { matchId, uuid: client.uuid });
  if (match.accepted.has(match.a.id) && match.accepted.has(match.b.id)) {
    clearTimeout(match.timer);
    pendingMatches.delete(matchId);
    try {
      log('Both players accepted math', { matchId });
      createMatch(match.a, match.b, 'ranked');
    } catch (err) {
      log(
        'Failed to create a match',
        {
          error: err instanceof Error ? err.message : 'Unknown error',
        },
        'error',
      );
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
  setClientState(client, ClientState.IDLE, 'match_declined');
  if (match.a.id !== client.id) {
    match.a.socket.send(JSON.stringify(msg));
    returnToQueue(match.a);
  }
  if (match.b.id !== client.id) {
    match.b.socket.send(JSON.stringify(msg));
    returnToQueue(match.b);
  }
  clearTimeout(match.timer);
  pendingMatches.delete(matchId);
}

export async function createMatch(
  a: ClientInfo,
  b: ClientInfo,
  mode: MatchMode,
  options?: { tournament?: TournamentMatchContext },
) {
  const matchId = uuid();

  if (mode !== 'ranked') {
    removeFromQueue(a.id);
    removeFromQueue(b.id);
  }

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
      players: [
        {
          playerIdentifier: a.uuid,
          side: 'west',
          alias: a.username,
          mmr: a.mmr,
        },
        {
          playerIdentifier: b.uuid,
          side: 'east',
          alias: b.username,
          mmr: b.mmr,
        },
      ],
      randomSeed,
      simulationStartTick,
      tournament: options?.tournament,
    });
  } catch (err) {
    log(
      'Allocator failed, sending error msg to client',
      {
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      'error',
    );
    const msg = {
      type: 'ERROR',
      code: 'ALLOCATOR',
      message: 'Game servers are currently busy, try again later.',
    };
    a.socket.send(JSON.stringify(msg));
    b.socket.send(JSON.stringify(msg));

    setClientState(a, ClientState.IDLE, 'handoff_failed_allocator');
    setClientState(b, ClientState.IDLE, 'handoff_failed_allocator');
    return;
  }

  const { roomIdentifier, endpointUrl, perPlayerJoinTokens } = allocatorRes!.data;

  [a, b].forEach((player, idx) => {
    const side = idx === 0 ? 'west' : 'east';
    setClientState(player, ClientState.HANDOFF_TO_GAME, 'handoff_initiated');
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
        tournament: options?.tournament,
      }),
    );
    handleHandoff(player, roomIdentifier, mode);
  });
  log(`Match created`, {
    matchId,
    playerA: { username: a.username, uuid: a.uuid },
    playerB: { username: b.username, uuid: b.uuid },
    tournament: options?.tournament,
  });
}

export function removeFromQueue(id: string): boolean {
  for (const [bucketId, clients] of buckets) {
    const idx = clients.findIndex((c) => c.id === id);
    if (idx !== -1) {
      clients.splice(idx, 1);
      cleanupBucket(bucketId);
      return true;
    }
  }
  return false;
}

export function clearQueue() {
  buckets.clear();
}

function cleanupBucket(bucketId: number) {
  const bucket = buckets.get(bucketId);
  if (bucket && bucket.length === 0) {
    buckets.delete(bucketId);
  }
}

/**
 * In case of f.ex. client A accepts, client B declines,
 * client A is returned to the right place in queue to ensure fair matchmaking.
 *
 * @param client
 */
function returnToQueue(client: ClientInfo) {
  if (!isAuthenticated(client)) return;
  setClientState(client, ClientState.IN_QUEUE, 'returned_to_queue');

  const bucketId = Math.floor(client.mmr / MMR_BUCKET_SIZE);
  if (!buckets.has(bucketId)) buckets.set(bucketId, []);
  const bucket = buckets.get(bucketId)!;
  bucket.push(client);
  bucket.sort((a, b) => a.joinedAt - b.joinedAt);

  log(`Client returned to queue bucket`, {
    uuid: client.uuid,
    bucket: bucketId,
    bucketSize: bucket.length,
    totalBuckets: buckets.size,
  });

  client.socket.send(JSON.stringify({ type: 'QUEUE_JOINED' }));
}
