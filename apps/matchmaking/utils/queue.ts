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

/**
 * Ranked/casual queue and allocator handoff.
 *
 * Flow overview:
 *   1. Frontend sends `JOIN_QUEUE` over `/matchmaking` WS → `handleJoinQueue(...)`.
 *   2. Clients are inserted into in‑memory MMR buckets.
 *   3. A periodic ticker in `apps/matchmaking/index.ts` calls `tryMatchQueue(...)`.
 *   4. When a pair is found we create a PendingMatch (`MATCH_FOUND` → accept/decline).
 *   5. On mutual accept we call `createMatch(..., 'ranked')` which:
 *        - asks allocator for a game node + per‑player join tokens
 *        - sends `HANDOFF` to both players
 *        - registers join timeouts via `handleHandoff(...)`.
 *
 * The same `createMatch(...)` helper is reused for invite matches (`invites.ts`)
 * and tournament scheduled matches (`scheduledMatches.ts`).
 */

// Bucket width for MMR-based matchmaking.
const MMR_BUCKET_SIZE = 50;
// In-memory buckets keyed by floor(mmr / MMR_BUCKET_SIZE).
const buckets = new Map<number, ClientInfo[]>();

/**
 * Try to form ranked/casual pairs from the queue buckets.
 *
 * Clients are spread into buckets based on MMR. The first index of each bucket
 * contains the oldest player in that bucket, so we:
 *   - take the oldest from each bucket
 *   - sort those by joinedAt
 *   - for each oldest player, scan nearby buckets within a widening MMR window.
 *
 * This helps avoid starvation where the oldest high‑MMR player blocks matching.
 */
export function tryMatchQueue(pendingMatches: Map<string, PendingMatch>) {
  // Collect one "oldest" candidate per non-empty bucket.
  const oldestPlayers: ClientInfo[] = [];
  for (const clients of buckets.values()) {
    if (clients.length > 0 && clients[0]) oldestPlayers.push(clients[0]);
  }
  if (oldestPlayers.length === 0) return;

  // Process candidates oldest-first across buckets.
  oldestPlayers.sort((a, b) => a.joinedAt - b.joinedAt);

  // Track ids already paired in this tick.
  const matchedPlayerIds = new Set<string>();

  for (const a of oldestPlayers) {
    // Skip if already matched while processing an earlier candidate.
    if (matchedPlayerIds.has(a.id)) continue;

    // Ensure `a` is still the oldest in its bucket (may have moved since collection).
    const bucketId = Math.floor(a.mmr / MMR_BUCKET_SIZE);
    const aBucket = buckets.get(bucketId);
    if (!aBucket || aBucket[0]?.id !== a.id) continue;

    // Widen the acceptable MMR window as the player waits.
    const waitedMs = Date.now() - a.joinedAt;
    const window = Math.min(500, MMR_BUCKET_SIZE + Math.floor(waitedMs / 2500) * MMR_BUCKET_SIZE);
    const bucketsToCheck = Math.ceil(window / MMR_BUCKET_SIZE);

    // Scan neighboring buckets for the first opponent inside the current window.
    for (let offset = -bucketsToCheck; offset <= bucketsToCheck; ++offset) {
      const searchBucket = buckets.get(bucketId + offset);
      if (!searchBucket) continue;

      // If searching our own bucket, skip index 0 because that's `a`.
      const startIdx = offset === 0 ? 1 : 0;
      let matchFound = false;
      for (let i = startIdx; i < searchBucket.length; ++i) {
        const b = searchBucket[i]!;

        // Accept the first opponent whose MMR fits in the window.
        if (Math.abs(a.mmr - b.mmr) <= window) {
          // Remove both from their buckets before creating the PendingMatch.
          aBucket.shift();
          searchBucket.splice(i, 1);

          matchedPlayerIds.add(a.id);
          matchedPlayerIds.add(b.id);

          // Drop empty buckets to keep iteration cheap.
          cleanupBucket(bucketId);
          cleanupBucket(bucketId + offset);

          log('Pair found in queue buckets', {
            a: a.uuid,
            b: b.uuid,
            window,
            totalBuckets: buckets.size,
          });
          // Notify clients and start accept/decline timer.
          addToPendingMatches(a, b, pendingMatches);
          matchFound = true;
          break;
        }
      }
      if (matchFound) break;
    }
  }
}

/**
 * Remove a client from the ranked queue and restore their previous state.
 *
 * Called on `LEAVE_QUEUE` from the frontend.
 */
export function handleLeaveQueue(client: ClientInfo) {
  if (removeFromQueue(client.id)) {
    // If they entered queue from tournament/invite, restore that; otherwise idle.
    const targetState = client.previousState ?? ClientState.IDLE;
    client.previousState = undefined;

    setClientState(client, targetState, 'left_queue');
    client.socket.send(JSON.stringify({ type: 'QUEUE_LEFT' }));
    log('Client left queue', { uuid: client.uuid, targetState: ClientState[targetState] });
  }
}

/**
 * Handle a client confirming queue join after a prompt.
 *
 * Used when the client is not idle and presses JOIN_QUEUE (see `sendJoinConfirm`).
 */
export async function handleJoinConfirm(client: ClientInfo) {
  // Preserve originating state so we can restore it on leave/timeout.
  if (client.state === ClientState.IN_TOURNAMENT || client.state === ClientState.IN_INVITE_LOBBY) {
    client.previousState = client.state;
  }
  handleJoinQueue(client);
}

/**
 * Insert an authenticated client into their MMR bucket and mark them IN_QUEUE.
 */
export async function handleJoinQueue(client: ClientInfo) {
  if (!isAuthenticated(client)) return;

  // joinedAt is used for fairness (older players are matched first).
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

/**
 * Create a PendingMatch offer and notify both players to accept/decline.
 *
 * Pending matches live in memory until:
 *   - both accept → allocate + handoff (`createMatch`)
 *   - one declines → other returns to queue
 *   - timeout elapses → accepted player returns to queue.
 */
export function addToPendingMatches(
  a: ClientInfo,
  b: ClientInfo,
  pendingMatches: Map<string, PendingMatch>,
) {
  const matchId = uuid();
  const accepted = new Set<string>();
  // Timeout for MATCH_FOUND responses.
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

  // Store the pending match for later accept/decline handling.
  pendingMatches.set(matchId, { a, b, accepted, timer });
  log('Match found awaiting confirmation', { matchId, players: [a.uuid, b.uuid] });
  const msgA = { type: 'MATCH_FOUND', matchId, opponent: { username: b.username, mmr: b.mmr } };
  const msgB = { type: 'MATCH_FOUND', matchId, opponent: { username: a.username, mmr: a.mmr } };
  setClientState(a, ClientState.PENDING_MATCH_ACCEPTANCE, 'match_pending');
  setClientState(b, ClientState.PENDING_MATCH_ACCEPTANCE, 'match_pending');
  a.socket.send(JSON.stringify(msgA));
  b.socket.send(JSON.stringify(msgB));
}

/**
 * Mark a player as accepted; when both accepted, allocate a room.
 */
export function handleAcceptMatch(
  matchId: string,
  client: ClientInfo,
  pendingMatches: Map<string, PendingMatch>,
) {
  const match = pendingMatches.get(matchId);
  if (!match) return;
  // Record acceptance and move client into the handoff-wait state.
  match.accepted.add(client.id);
  setClientState(client, ClientState.AWAITING_HANDOFF, 'match_accepted');
  log(`Match accepted`, { matchId, uuid: client.uuid });
  if (match.accepted.has(match.a.id) && match.accepted.has(match.b.id)) {
    // Both accepted: stop waiting and start allocation.
    clearTimeout(match.timer);
    pendingMatches.delete(matchId);
    try {
      log('Both players accepted math', { matchId });
      // Fire-and-forget; errors are caught below.
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

/**
 * Handle a decline:
 *   - notify the other player
 *   - return them to queue
 *   - clear the PendingMatch.
 */
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

/**
 * Allocate a game room for two players and hand them off to a game node.
 *
 * Called from ranked accept path, invite flow, and tournament scheduling.
 */
export async function createMatch(
  a: ClientInfo,
  b: ClientInfo,
  mode: MatchMode,
  options?: { tournament?: TournamentMatchContext },
) {
  const matchId = uuid();

  // Ranked players are already removed by `tryMatchQueue`; other modes remove here.
  if (mode !== 'ranked') {
    removeFromQueue(a.id);
    removeFromQueue(b.id);
  }

  // Random seed is shared so client/server simulations stay deterministic.
  const randomSeed = Math.floor(Math.random() * 0x100000000);
  // Epoch-based start time; clients convert to local tick schedule.
  const simulationStartTick = Date.now() + 5000;

  let allocatorRes;
  try {
    // Ask allocator to reserve a room and mint per-player join tokens.
    log('Requesting allocation', {
      matchId,
      players: [a.uuid, b.uuid],
      randomSeed,
      simulationStartTick,
    });

    allocatorRes = await axios.post(`${ALLOCATOR_URL}/allocate`, {
      // Idempotency lets allocator dedupe retries on transient failures.
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
    // Allocation failed: tell both players and reset state.
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
    // Transition into HANDOFF state and tell client where/when to connect.
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
    // Start join-timeout window until game-server publishes `room_ready`.
    handleHandoff(player, roomIdentifier, mode);
  });
  log(`Match created`, {
    matchId,
    playerA: { username: a.username, uuid: a.uuid },
    playerB: { username: b.username, uuid: b.uuid },
    tournament: options?.tournament,
  });
}

/**
 * Remove a client from whichever bucket they are currently in.
 *
 * Returns true if they were found and removed.
 */
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

/** Clear all buckets (used on service shutdown). */
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
 */
function returnToQueue(client: ClientInfo) {
  if (!isAuthenticated(client)) return;
  // Mark them back in queue before reinserting into buckets.
  setClientState(client, ClientState.IN_QUEUE, 'returned_to_queue');

  // Reinsert into bucket and keep oldest-first ordering.
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
