import { ClientState, type MatchMode, type ClientInfo } from '../types/types.ts';
import { handleJoinQueue } from './queue';
import { log } from '@utils/logger';
import { setClientState } from './state.ts';

/**
 * Tracks players who have been handed off to the game server but have not yet
 * successfully established their game WebSocket connection.
 *
 * Where this fits in the flow:
 *   - `createMatch` in `apps/matchmaking/utils/queue.ts` allocates a room and sends
 *     a HANDOFF message to each player with the roomId + join token.
 *   - Right after that, `handleHandoff(...)` is called to start a per‑player timer.
 *   - The game server publishes `room_ready` in Redis once both players are connected;
 *     `MatchmakingRedisBridge` forwards that into `handleAdmitConfirmed(...)`.
 *
 * If a player fails to join the game node within a timeout, this module:
 *   - sends a HANDOFF_TIMEOUT message to the client
 *   - restores their matchmaking state (queue, tournament, or idle)
 *   - optionally requeues them for ranked matches
 */
interface PendingHandoff {
  /** Per‑player timeout handles keyed by player UUID. */
  timers: Record<string, NodeJS.Timeout>;
  /** Players currently expected to join this room, keyed by player UUID. */
  players: Record<string, ClientInfo>;
  /** Room identifier allocated by the allocator / game nodes. */
  roomIdentifier: string;
  /** Match kind driving the fallback behavior (ranked/casual vs invite vs tournament). */
  mode?: MatchMode;
}

// Active handoff windows keyed by roomIdentifier.
const pendingHandoffs = new Map<string, PendingHandoff>();

/**
 * Register a player as being in the process of handoff to a game room.
 *
 * If the player does not connect to the game node within the timeout window,
 * they are notified and either:
 *   - returned to tournament/idle state (tournament/invite), or
 *   - requeued into ranked matchmaking.
 */
export function handleHandoff(player: ClientInfo, roomIdentifier: string, mode?: MatchMode) {
  // Ensure a PendingHandoff record exists for this room.
  let handoff = pendingHandoffs.get(roomIdentifier);
  if (!handoff) {
    handoff = { timers: {}, players: {}, roomIdentifier, mode } as PendingHandoff;
    pendingHandoffs.set(roomIdentifier, handoff);
  }
  // Track the player under this room so we can clean up on success or timeout.
  handoff.players[player.uuid] = player;

  // Start a join‑timeout window. If it elapses, we roll back matchmaking state.
  const timer = setTimeout(() => {
    // Guard: if we can't talk to the client anymore, just log and bail.
    if (!player || !player.socket) {
      log(
        'Player socket missing on handoff timeout',
        {
          uuid: player?.uuid ?? 'Unknown',
          roomIdentifier,
        },
        'error',
      );
      return;
    }

    // Tournament / invite matches do not requeue; ranked/casual do.
    if (mode === 'tournament') {
      // Restore tournament state and notify the browser to show a scheduled‑match failure.
      setClientState(player, ClientState.IN_TOURNAMENT, 'handoff_failed_timeout_tournament');
      player.socket.send(
        JSON.stringify({
          type: 'HANDOFF_TIMEOUT',
          roomIdentifier,
          message: 'Failed to join scheduled match in time.',
        }),
      );
    } else if (mode === 'invite') {
      // Return to idle for invite matches and surface a simple failure to join.
      setClientState(player, ClientState.IDLE, 'handoff_failed_timeout_invite');
      player.socket.send(
        JSON.stringify({
          type: 'HANDOFF_TIMEOUT',
          roomIdentifier,
          message: 'Failed to join match in time.',
        }),
      );
    } else {
      // Ranked/casual: tell the client and immediately rejoin queue.
      player.socket.send(
        JSON.stringify({
          type: 'HANDOFF_TIMEOUT',
          roomIdentifier,
          message: 'Failed to join game server in time. Rejoining queue.',
        }),
      );
      handleJoinQueue(player);
    }

    // Cleanup this player's timer + tracking; delete the room when empty.
    clearTimeout(handoff.timers[player.uuid]);
    delete handoff.timers[player.uuid];
    delete handoff.players[player.uuid];
    if (Object.keys(handoff.players).length === 0) pendingHandoffs.delete(roomIdentifier);
  }, 15000);

  // Persist timer so `handleAdmitConfirmed` or this callback can clear it.
  handoff.timers[player.uuid] = timer;
  log('Added player to pending handoffs map', { uuid: player.uuid, roomIdentifier, mode });
}

/**
 * Called when the game node signals that a room is ready and both players
 * have successfully connected (`room_ready`).
 *
 * Cancels pending handoff timers and closes matchmaking sockets for the
 * players in this room.
 */
export function handleAdmitConfirmed(roomIdentifier: string) {
  const handoff = pendingHandoffs.get(roomIdentifier);
  if (handoff) {
    // Room is live: cancel all join‑timeouts.
    Object.values(handoff.timers).forEach(clearTimeout);
    // Close matchmaking WS so clients only keep their game WS.
    Object.values(handoff.players).forEach((player) => {
      player.socket.close();
    });
    log('Match started, closing connections', {
      roomIdentifier,
      playerUuids: Object.keys(handoff.players),
    });
    // Remove the record; any late players will need a new handoff.
    pendingHandoffs.delete(roomIdentifier);
  }
}
