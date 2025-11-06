import type { AnyMessage, MessageCtx } from '../domain/handlers/types';
import { onConnected } from '../domain/handlers/onConnected';
import { onError } from '../domain/handlers/onError';
import { onLobbyUpdated } from '../domain/handlers/onLobbyUpdated';
import { onBracketSnapshot } from '../domain/handlers/onBracketSnapshot';
import { onMatchesReady } from '../domain/handlers/onMatchesReady';
import { onCountdown } from '../domain/handlers/onCountdown';
import { onHandoff } from '../domain/handlers/onHandoff';
import { onHandoffTimeout } from '../domain/handlers/onHandoffTimeout';

const handlers: Partial<Record<AnyMessage['type'], (msg: any, ctx: MessageCtx) => void>> = {
  CONNECTED: onConnected,
  ERROR: onError,
  TOURNAMENT_LOBBY_UPDATED: onLobbyUpdated,
  TOURNAMENT_BRACKET_SNAPSHOT: onBracketSnapshot,
  TOURNAMENT_MATCHES_READY: onMatchesReady,
  TOURNAMENT_MATCH_COUNTDOWN: onCountdown,
  HANDOFF: onHandoff,
  HANDOFF_TIMEOUT: onHandoffTimeout,
};

export function routeMessage(msg: AnyMessage, ctx: MessageCtx) {
  handlers[msg.type]?.(msg as any, ctx);
}

