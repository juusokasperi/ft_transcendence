import { useCallback, useEffect, useRef } from 'react';
import type { MatchmakingMessage } from '@pong/shared/protocol/net';
import { createMatchmakingClient } from '../../../../services/matchmaking';
import type { OnlineAction } from '../state/machine';

type Handlers = {
  dispatch: React.Dispatch<OnlineAction>;
  onAuthError: (message?: string) => void;
  onAllocatorError: (message?: string) => void;
  onMatchTimeout?: () => void;
  onMatchDeclined?: () => void;
};

type UseMatchmakingClientArgs = {
  dispatch: React.Dispatch<OnlineAction>;
  connectKey: number;
  requestReconnect: () => void;
  onAuthError: (message?: string) => void;
  onAllocatorError: (message?: string) => void;
  onMatchTimeout?: () => void;
  onMatchDeclined?: () => void;
};

export function useMatchmakingClient({
  dispatch,
  connectKey,
  requestReconnect,
  onAuthError,
  onAllocatorError,
  onMatchTimeout,
  onMatchDeclined,
}: UseMatchmakingClientArgs) {
  const handlersRef = useRef<Handlers>({
    dispatch,
    onAuthError,
    onAllocatorError,
    onMatchTimeout,
    onMatchDeclined,
  });
  const clientRef = useRef<ReturnType<typeof createMatchmakingClient> | null>(null);

  useEffect(() => {
    handlersRef.current = {
      dispatch,
      onAuthError,
      onAllocatorError,
      onMatchTimeout,
      onMatchDeclined,
    };
  }, [dispatch, onAuthError, onAllocatorError, onMatchTimeout, onMatchDeclined]);

  useEffect(() => {
    const client = createMatchmakingClient((msg: MatchmakingMessage) => {
      const handlers = handlersRef.current;
      switch (msg.type) {
        case 'CONNECTED':
          handlers.dispatch({ type: 'connected', clientId: msg.clientId });
          break;
        case 'QUEUE_JOINED':
          handlers.dispatch({ type: 'queueJoined' });
          break;
        case 'QUEUE_LEFT':
          handlers.dispatch({ type: 'queueLeft' });
          break;
        case 'MATCH_FOUND':
          handlers.dispatch({
            type: 'matchFound',
            matchId: msg.matchId,
            opponent: { username: msg.opponent.username, mmr: msg.opponent.mmr },
          });
          break;
        case 'MATCH_DECLINED':
          handlers.dispatch({ type: 'matchDeclined' });
          handlers.onMatchDeclined?.();
          break;
        case 'MATCH_TIMEOUT':
          handlers.dispatch({ type: 'matchTimeout' });
          handlers.onMatchTimeout?.();
          break;
        case 'HANDOFF':
          handlers.dispatch({
            type: 'handoff',
            payload: {
              serverUrl: msg.gameServerWSUrl,
              matchId: msg.matchId,
              roomIdentifier: msg.roomIdentifier,
              side: msg.side,
              randomSeed: msg.randomSeed,
              joinToken: msg.joinToken,
            },
          });
          break;
        case 'ERROR':
          if (msg.code === 'AUTH') {
            handlers.dispatch({ type: 'authError' });
            handlers.onAuthError(msg.message);
          } else if (msg.code === 'ALLOCATOR') {
            handlers.dispatch({ type: 'allocatorError' });
            handlers.onAllocatorError(msg.message);
          }
          break;
        case 'TOURNAMENT_LOBBY_UPDATED':
        case 'TOURNAMENT_BRACKET_SNAPSHOT':
          // Ignored in online game view for now.
          break;
        default:
          // noop for messages we do not handle
          break;
      }
    });

    clientRef.current = client;
    return () => {
      client.socket.close();
      clientRef.current = null;
    };
  }, [connectKey]);

  const joinQueue = useCallback((alias?: string) => {
    const trimmed = alias?.trim() || undefined;
    clientRef.current?.joinQueue(trimmed);
  }, []);

  const leaveQueue = useCallback(() => {
    clientRef.current?.leaveQueue();
  }, []);

  const acceptMatch = useCallback((matchId: string) => {
    clientRef.current?.acceptMatch(matchId);
  }, []);

  const declineMatch = useCallback((matchId: string) => {
    clientRef.current?.declineMatch(matchId);
  }, []);

  const acceptInvite = useCallback((lobbyId: string) => {
    clientRef.current?.acceptInvite(lobbyId);
  }, []);

  const reconnect = useCallback(() => {
    requestReconnect();
  }, [requestReconnect]);

  return {
    joinQueue,
    leaveQueue,
    acceptMatch,
    declineMatch,
    acceptInvite,
    reconnect,
  };
}
