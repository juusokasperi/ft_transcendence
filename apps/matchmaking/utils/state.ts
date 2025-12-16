import { ClientState, type ClientInfo } from '../types/types.ts';
import { log } from '@utils/logger';

/**
 * Client state helper for matchmaking.
 *
 * Matchmaking uses a simple server-side state machine (`ClientState`) to gate
 * which WS messages are accepted and to drive UI transitions on the frontend.
 *
 * `setClientState` is the single write path for that state:
 *   - called from queue flow (`queue.ts`) when joining/leaving/accepting matches
 *   - called from invite flow (`invites.ts`) when creating/joining/destroying lobbies
 *   - called from tournament flow (`scheduledMatches.ts`) on join/leave/restore/forfeit
 *   - called from `apps/matchmaking/index.ts` on disconnect cleanup.
 *
 * Centralizing this makes state transitions easy to audit in logs.
 */

/**
 * Reasons for client state transitions in the matchmaking service.
 *
 * These values are used exclusively for logging and debugging; they make it
 * easier to trace how a client moved between states (queue, tournament, invite, etc.).
 *
 * When adding a new state transition elsewhere, add the corresponding reason here
 * so logs stay consistent.
 */
export type StateTransitionReason =
  | 'client_disconnected'
  | 'joined_queue'
  | 'returned_to_queue'
  | 'left_queue'
  | 'match_pending'
  | 'match_accepted'
  | 'match_declined'
  | 'match_timeout'
  | 'handoff_initiated'
  | 'handoff_failed_allocator'
  | 'handoff_failed_timeout_invite'
  | 'handoff_failed_timeout_tournament'
  | 'joined_invite_lobby'
  | 'invite_lobby_destroyed'
  | 'joined_tournament'
  | 'left_tournament'
  | 'restored_tournament_membership';

/**
 * Update a client's matchmaking state and log the transition.
 *
 * This does not emit any WS messages by itself; callers are responsible for
 * notifying the browser if the UI should change.
 */
export function setClientState(
  client: ClientInfo,
  state: ClientState,
  reason: StateTransitionReason,
) {
  // Debug-level log to help reconstruct the matchmaking flow post-mortem.
  log(
    'Client state transition',
    { uuid: client.uuid, from: ClientState[client.state], to: ClientState[state], reason },
    'debug',
  );
  // Mutate in place; client objects are shared across matchmaking modules.
  client.state = state;
}
