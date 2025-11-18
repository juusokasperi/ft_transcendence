import { useCallback, useEffect, useRef } from 'react';
import type { MatchmakingMessage } from '@pong/shared/protocol/net';
import { createMatchmakingClient } from '../../../../services/matchmaking';
import type { OnlineAction } from '../state/machine';

type Handlers = {
  dispatch: React.Dispatch<OnlineAction>;
  onAuthError: (message?: string) => void;
  onAllocatorError: (message?: string) => void;
  onRatelimit: (message?: string) => void;
  onInTournamentLobby: (message?: string) => void;
  onInInviteLobby: (message?: string) => void;
  onMatchTimeout?: () => void;
  onMatchDeclined?: () => void;
};

type UseMatchmakingClientArgs = {
  dispatch: React.Dispatch<OnlineAction>;
  connectKey: number;
  requestReconnect: () => void;
  enabled: boolean;
  onAuthError: (message?: string) => void;
  onAllocatorError: (message?: string) => void;
  onRatelimit: (message?: string) => void;
  onInTournamentLobby: (message?: string) => void;
  onInInviteLobby: (message?: string) => void;
  onMatchTimeout?: () => void;
  onMatchDeclined?: () => void;
};

export function useMatchmakingClient({
  dispatch,
  connectKey,
  requestReconnect,
  enabled,
  onAuthError,
  onAllocatorError,
  onRatelimit,
  onInTournamentLobby,
  onInInviteLobby,
  onMatchTimeout,
  onMatchDeclined,
}: UseMatchmakingClientArgs) {
  const handlersRef = useRef<Handlers>({
    dispatch,
    onAuthError,
    onAllocatorError,
    onRatelimit,
    onInTournamentLobby,
    onInInviteLobby,
    onMatchTimeout,
    onMatchDeclined,
  });
  const clientRef = useRef<ReturnType<typeof createMatchmakingClient> | null>(null);
  const requestReconnectRef = useRef(requestReconnect);
  const pendingJoinRef = useRef(false);
  const intentionalSocketsRef = useRef(new WeakSet<WebSocket>());
  const enabledRef = useRef(enabled);

  useEffect(() => {
    handlersRef.current = {
      dispatch,
      onAuthError,
      onAllocatorError,
      onRatelimit,
      onInTournamentLobby,
      onInInviteLobby,
      onMatchTimeout,
      onMatchDeclined,
    };
  }, [
    dispatch,
    onAuthError,
    onAllocatorError,
    onRatelimit,
    onInTournamentLobby,
    onInInviteLobby,
    onMatchTimeout,
    onMatchDeclined,
  ]);

  useEffect(() => {
    requestReconnectRef.current = requestReconnect;
  }, [requestReconnect]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled && clientRef.current) {
      const currentClient = clientRef.current;
      intentionalSocketsRef.current.add(currentClient.socket);
      currentClient.socket.close();
      clientRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const client = createMatchmakingClient(
      (msg: MatchmakingMessage) => {
        const handlers = handlersRef.current;
        switch (msg.type) {
          case 'CONNECTED':
            handlers.dispatch({ type: 'connected', clientId: msg.clientId });
            break;
          case 'QUEUE_JOINED':
            pendingJoinRef.current = false;
            handlers.dispatch({ type: 'queueJoined' });
            break;
          case 'QUEUE_LEFT':
            pendingJoinRef.current = false;
            handlers.dispatch({ type: 'queueLeft' });
            break;
          case 'MATCH_FOUND':
            pendingJoinRef.current = false;
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
            pendingJoinRef.current = false;
            if (msg.code === 'AUTH') {
              handlers.dispatch({ type: 'authError' });
              handlers.onAuthError(msg.message);
            } else if (msg.code === 'ALLOCATOR') {
              handlers.dispatch({ type: 'allocatorError' });
              handlers.onAllocatorError(msg.message);
            } else if (msg.code === 'RATELIMIT') {
              handlers.dispatch({ type: 'ratelimitError' });
              handlers.onRatelimit(msg.message);
            } else if (msg.code === 'IN_TOURNAMENT_LOBBY') {
              handlers.dispatch({ type: 'inTournamentLobbyError' });
              handlers.onInTournamentLobby(msg.message);
            } else if (msg.code === 'IN_INVITE_LOBBY') {
              handlers.dispatch({ type: 'inInviteLobbyError' });
              handlers.onInInviteLobby(msg.message);
            }

            break;
          case 'INFO':
            if (msg.message === 'New connection detected, closing this one') {
              intentionalSocketsRef.current.add(client.socket);
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
      },
      {
        onClose: (_event) => {
          if (clientRef.current === client) {
            clientRef.current = null;
          }
          if (intentionalSocketsRef.current.delete(client.socket)) {
            return;
          }
          if (clientRef.current !== null) {
            return;
          }
          if (!enabledRef.current) {
            return;
          }
          requestReconnectRef.current();
        },
      },
    );

    clientRef.current = client;
    if (pendingJoinRef.current) {
      client.joinQueue();
    }
    return () => {
      intentionalSocketsRef.current.add(client.socket);
      client.socket.close();
      clientRef.current = null;
    };
  }, [connectKey, enabled]);

  const joinQueue = useCallback(() => {
    pendingJoinRef.current = true;

    if (!enabledRef.current) {
      requestReconnectRef.current();
      return;
    }

    const client = clientRef.current;
    if (!client) {
      requestReconnectRef.current();
      return;
    }

    const { socket } = client;
    if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
      intentionalSocketsRef.current.add(socket);
      socket.close();
      requestReconnectRef.current();
      return;
    }

    client.joinQueue();
  }, []);

  const leaveQueue = useCallback(() => {
    pendingJoinRef.current = false;
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
    if (!enabledRef.current) return;
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
