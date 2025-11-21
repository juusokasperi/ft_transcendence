import { useCallback, useEffect, useRef } from 'react';
import { TournamentSocket } from '../net/TournamentSocket';
import type { MatchmakingMessage } from '../net/messageTypes';
import {
  computeDelayWithCooldown,
  DEFAULT_RECONNECT_DELAY,
  nextBackoffDelay,
} from '../domain/connectionBackoff';

type Options = {
  userReady: boolean;
  userUuid: string | null;
  onMessage: (msg: MatchmakingMessage) => void;
  onSnackbar: (opts: {
    message: string;
    variant: 'error' | 'warning' | 'info' | 'success';
  }) => void;
  debug?(event: string, payload?: Record<string, unknown>): void;
  getActiveTournamentId: () => number | null;
  setConnectionReady: (ready: boolean) => void;
};

export function useTournamentConnection({
  userReady,
  userUuid,
  onMessage,
  onSnackbar,
  debug,
  getActiveTournamentId,
  setConnectionReady,
}: Options) {
  const socketRef = useRef<TournamentSocket | null>(null);
  const manualCloseRef = useRef(false);
  const connectionErrorShownRef = useRef(false);
  const hadSuccessfulConnectionRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectionStateRef = useRef<'idle' | 'connecting' | 'open'>('idle');
  const backoffDelayRef = useRef(DEFAULT_RECONNECT_DELAY);
  const lastDisconnectRef = useRef<number | null>(null);

  const debugLog = useCallback((e: string, p?: Record<string, unknown>) => debug?.(e, p), [debug]);

  // Keep unstable callbacks in refs to avoid effect restart loops
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const getActiveTournamentIdRef = useRef(getActiveTournamentId);
  useEffect(() => {
    getActiveTournamentIdRef.current = getActiveTournamentId;
  }, [getActiveTournamentId]);

  useEffect(() => {
    if (!userReady || !userUuid) return;

    manualCloseRef.current = false;
    connectionStateRef.current = 'idle';
    backoffDelayRef.current = DEFAULT_RECONNECT_DELAY;
    hadSuccessfulConnectionRef.current = false;
    setConnectionReady(false);
    debugLog?.('connection:effect-mounted', { userUuid });

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
        debugLog?.('connection:timer-cleared');
      }
    };

    const queueReconnect = () => {
      if (manualCloseRef.current) return;
      if (reconnectTimerRef.current !== null) return;
      connectionStateRef.current = 'idle';
      const delay = backoffDelayRef.current;
      backoffDelayRef.current = nextBackoffDelay(backoffDelayRef.current);
      debugLog?.('connection:queue-reconnect', { delay });
      startConnection(delay);
    };

    function startConnection(requestedDelay = 0) {
      if (manualCloseRef.current) return;
      if (connectionStateRef.current !== 'idle') return;
      if (reconnectTimerRef.current !== null) return;

      const delay = computeDelayWithCooldown(lastDisconnectRef.current, requestedDelay, Date.now());
      debugLog?.('connection:start-requested', { requestedDelay, delay });

      const begin = () => {
        reconnectTimerRef.current = null;
        if (manualCloseRef.current) return;

        connectionStateRef.current = 'connecting';
        debugLog?.('connection:opening');
        const sock = new TournamentSocket();
        sock.connect({
          onMessage: (msg) => onMessageRef.current(msg),
          onOpen: () => {
            connectionStateRef.current = 'open';
            backoffDelayRef.current = DEFAULT_RECONNECT_DELAY;
            connectionErrorShownRef.current = false;
            hadSuccessfulConnectionRef.current = true;
            setConnectionReady(true);
            debugLog?.('connection:open');
          },
          onError: () => {
            if (manualCloseRef.current) return;
            connectionStateRef.current = 'idle';
            lastDisconnectRef.current = Date.now();
            setConnectionReady(false);
            if (
              !connectionErrorShownRef.current &&
              backoffDelayRef.current > DEFAULT_RECONNECT_DELAY
            ) {
              onSnackbar({ message: 'Tournament connection error. Retrying…', variant: 'error' });
              connectionErrorShownRef.current = true;
            }
            debugLog?.('connection:error');
            queueReconnect();
          },
          onClose: (event) => {
            setConnectionReady(false);
            if (manualCloseRef.current) return;
            connectionStateRef.current = 'idle';
            lastDisconnectRef.current = Date.now();
            const normalCloseCodes = [1000, 1001, 1005];
            const abnormal = !event.wasClean || !normalCloseCodes.includes(event.code);
            debugLog?.('connection:closed', {
              wasClean: event.wasClean,
              code: event.code,
              reason: event.reason,
              abnormal,
            });
            if (
              abnormal &&
              !connectionErrorShownRef.current &&
              hadSuccessfulConnectionRef.current
            ) {
              onSnackbar({
                message: 'Tournament connection lost. Reconnecting…',
                variant: 'warning',
              });
              connectionErrorShownRef.current = true;
              debugLog?.('connection:error-snackbar-shown');
            }
            queueReconnect();
          },
        });

        socketRef.current = sock;
      };

      if (delay > 0) reconnectTimerRef.current = window.setTimeout(begin, delay);
      else begin();
    }

    startConnection();

    return () => {
      manualCloseRef.current = true;
      connectionStateRef.current = 'idle';
      backoffDelayRef.current = DEFAULT_RECONNECT_DELAY;
      clearReconnectTimer();
      setConnectionReady(false);
      const socket = socketRef.current;
      if (socket) {
        socket.close();
        socketRef.current = null;
      }
      lastDisconnectRef.current = Date.now();
      debugLog?.('connection:effect-unmounted');
    };
  }, [debugLog, onSnackbar, userReady, userUuid]);

  const createTournament = useCallback((size: number, name?: string) => {
    socketRef.current?.createTournament(size as any, name);
  }, []);

  const joinTournament = useCallback((id: number | string) => {
    socketRef.current?.joinTournament(id);
  }, []);

  const leaveTournament = useCallback((id: number | string) => {
    socketRef.current?.leaveTournament(id);
  }, []);

  const acceptScheduled = useCallback((matchId: number) => {
    socketRef.current?.acceptScheduled(matchId);
  }, []);

  return { createTournament, joinTournament, leaveTournament, acceptScheduled } as const;
}
