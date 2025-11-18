import { ClientState, type ClientInfo } from '../types/types.ts';
import { log } from '@utils/logger';

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

export function setClientState(
  client: ClientInfo,
  state: ClientState,
  reason: StateTransitionReason,
) {
  log(
    'Client state transition',
    { uuid: client.uuid, from: ClientState[client.state], to: ClientState[state], reason },
    'debug',
  );
  client.state = state;
}
