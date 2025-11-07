import type { MessageCtx } from '../domain/handlers/types';
import type {
  ConnectedMessage,
  ErrorMessage,
  TournamentLobbyUpdatedMessage,
  TournamentBracketSnapshotMessage,
  TournamentMatchesReadyMessage,
  TournamentMatchCountdownMessage,
  HandoffMessage,
  HandoffTimeoutMessage,
  MatchmakingMessage,
} from './messageTypes';
import { onConnected } from '../domain/handlers/onConnected';
import { onError } from '../domain/handlers/onError';
import { onLobbyUpdated } from '../domain/handlers/onLobbyUpdated';
import { onBracketSnapshot } from '../domain/handlers/onBracketSnapshot';
import { onMatchesReady } from '../domain/handlers/onMatchesReady';
import { onCountdown } from '../domain/handlers/onCountdown';
import { onHandoff } from '../domain/handlers/onHandoff';
import { onHandoffTimeout } from '../domain/handlers/onHandoffTimeout';

export function routeMessage(msg: ConnectedMessage, ctx: MessageCtx): void;
export function routeMessage(msg: ErrorMessage, ctx: MessageCtx): void;
export function routeMessage(msg: TournamentLobbyUpdatedMessage, ctx: MessageCtx): void;
export function routeMessage(msg: TournamentBracketSnapshotMessage, ctx: MessageCtx): void;
export function routeMessage(msg: TournamentMatchesReadyMessage, ctx: MessageCtx): void;
export function routeMessage(msg: TournamentMatchCountdownMessage, ctx: MessageCtx): void;
export function routeMessage(msg: HandoffMessage, ctx: MessageCtx): void;
export function routeMessage(msg: HandoffTimeoutMessage, ctx: MessageCtx): void;
export function routeMessage(msg: MatchmakingMessage, ctx: MessageCtx): void {
  switch (msg.type) {
    case 'CONNECTED':
      return onConnected(msg, ctx);
    case 'ERROR':
      return onError(msg, ctx);
    case 'TOURNAMENT_LOBBY_UPDATED':
      return onLobbyUpdated(msg, ctx);
    case 'TOURNAMENT_BRACKET_SNAPSHOT':
      return onBracketSnapshot(msg, ctx);
    case 'TOURNAMENT_MATCHES_READY':
      return onMatchesReady(msg, ctx);
    case 'TOURNAMENT_MATCH_COUNTDOWN':
      return onCountdown(msg, ctx);
    case 'HANDOFF':
      return onHandoff(msg, ctx);
    case 'HANDOFF_TIMEOUT':
      return onHandoffTimeout(msg, ctx);
  }
}
