import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ActiveHandoff } from '../state/types';
import type { MatchPhase } from '../domain/countdown';
import { useMatchOverEvent } from '../../shared/hooks/useMatchOverEvent';
import { useAppContext } from '../../../../context/AppContext';

type Options = {
  matchPhase: MatchPhase;
  setMatchPhase: (p: MatchPhase) => void;
  handoff: ActiveHandoff | null;
  setHandoff: (h: ActiveHandoff | null) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  refreshTournamentState: () => void | Promise<void>;
  debugLog: (e: string, p?: Record<string, unknown>) => void;
  enqueueSnackbar: (opts: {
    message: string;
    variant: 'error' | 'warning' | 'info' | 'success';
  }) => void;
};

export function useMatchLifecycle({
  matchPhase,
  setMatchPhase,
  handoff,
  setHandoff,
  canvasRef,
  refreshTournamentState,
  debugLog,
  enqueueSnackbar,
}: Options) {
  const { navigate } = useAppContext();
  const appRef = useRef<{ destroy(): void; giveUp?: () => void } | null>(null);
  const rejoinTimerRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const teardownInProgressRef = useRef(false);
  const markTournamentRoom = useCallback((roomId: string) => {
    (async () => {
      try {
        const { markTournamentRoom } = await import(
          '../../../../games/pong/modes/online/resume'
        );
        markTournamentRoom(roomId);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useLayoutEffect(() => {
    if (matchPhase !== 'starting' && matchPhase !== 'playing') return;
    if (!canvasRef.current) return;
    requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
  }, [matchPhase, canvasRef]);

  const performMatchTeardown = useCallback(
    (options?: { refreshDelayMs?: number }) => {
      if (teardownInProgressRef.current) {
        debugLog('action:quit-match', { phase: 'teardown-skip', reason: 'in-progress' });
        return;
      }
      const refreshDelayMs = options?.refreshDelayMs ?? 1000;
      debugLog('action:quit-match', { phase: 'teardown-start', refreshDelayMs });
      teardownInProgressRef.current = true;

      // Best-effort: clear any stored resume tokens for this room so that
      // the tournament page does not auto-resume into a stale game after
      // we navigate back. This complements server-side cleanup and client
      // MATCH_END handling, covering race windows.
      (async () => {
        try {
          const roomId = handoff?.roomIdentifier;
          if (roomId) {
            const { clearStoredResumeTokens } = await import(
              '../../../../games/pong/modes/online/resume'
            );
            clearStoredResumeTokens(roomId);
            debugLog('auto-resume:cleared-on-teardown', { roomIdentifier: roomId });
          }
        } catch {}
      })();

      if (appRef.current) {
        appRef.current.destroy();
        appRef.current = null;
      }
      setMatchPhase('idle');
      setHandoff(null);

      if (rejoinTimerRef.current) {
        window.clearTimeout(rejoinTimerRef.current);
        rejoinTimerRef.current = null;
      }

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      refreshTimerRef.current = window.setTimeout(() => {
        debugLog('action:quit-match', { phase: 'refreshing' });
        void refreshTournamentState();
        teardownInProgressRef.current = false;
      }, refreshDelayMs);
    },
    [debugLog, refreshTournamentState, setHandoff, setMatchPhase, handoff],
  );

  useEffect(() => {
    if (matchPhase !== 'starting' || !handoff || !canvasRef.current) return;

    let cancelled = false;
    const seat = handoff?.side === 'east' ? 'P1' : 'P2';

    (async () => {
      try {
        const { bootstrapOnlinePong } = await import('../../../../games/pong/host/online-embed');
        if (cancelled) return;
        const app = await bootstrapOnlinePong(canvasRef.current!, {
          serverUrl: handoff.gameServerWSUrl,
          matchId: handoff.matchId,
          roomIdentifier: handoff.roomIdentifier,
          seat,
          joinToken: handoff.joinToken,
          randomSeed: handoff.randomSeed,
          onMatchEnd: (reason: string, winner?: 'east' | 'west') => {
            debugLog('match-end-auto-quit', { reason, winner });
            // Clear any stored resume token as soon as the match resolves to
            // prevent the tournament auto-resume effect from kicking in.
            (async () => {
              try {
                const roomId = handoff?.roomIdentifier;
                if (roomId) {
                  const { clearStoredResumeTokens } = await import(
                    '../../../../games/pong/modes/online/resume'
                  );
                  clearStoredResumeTokens(roomId);
                  debugLog('auto-resume:cleared-on-end', { roomIdentifier: roomId });
                }
              } catch {}
            })();
            // If opponent quit (forfeit) and you are the winner, route back to the
            // tournament detail page immediately for clarity.
            if (reason === 'forfeit' && winner && winner === handoff.side) {
              enqueueSnackbar({
                message: 'Your opponent declared forfeit. You won this match!',
                variant: 'success',
              });
              try {
                if (handoff.tournamentId) {
                  navigate(`/pong/tournaments/${handoff.tournamentId}`);
                } else {
                  navigate('/pong/tournaments');
                }
              } catch {}
            }
            const delay = reason === 'completed' ? 2500 : 1500;
            performMatchTeardown({ refreshDelayMs: delay });
          },
        });
        if (cancelled) {
          app.destroy();
          return;
        }
        appRef.current = app;
        if (handoff?.roomIdentifier) {
          markTournamentRoom(handoff.roomIdentifier);
        }
        setMatchPhase('playing');
      } catch (error) {
        enqueueSnackbar({ message: 'Failed to start tournament match', variant: 'error' });
        setMatchPhase('idle');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    canvasRef,
    debugLog,
    enqueueSnackbar,
    handoff,
    matchPhase,
    performMatchTeardown,
    markTournamentRoom,
    setMatchPhase,
  ]);

  useEffect(
    () => () => {
      appRef.current?.destroy();
      appRef.current = null;
    },
    [],
  );

  useEffect(
    () => () => {
      if (rejoinTimerRef.current) {
        window.clearTimeout(rejoinTimerRef.current);
        rejoinTimerRef.current = null;
      }
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (matchPhase === 'starting' || matchPhase === 'playing') {
      document.body.classList.add('pong-playing');
    } else {
      document.body.classList.remove('pong-playing');
    }
    return () => document.body.classList.remove('pong-playing');
  }, [matchPhase]);

  const handleQuitMatch = useCallback(() => {
    debugLog('action:quit-match', { trigger: 'manual' });
    // Intentionally forfeit the current online match so the server ends it
    // and stops publishing resume tokens for our session. This preserves
    // tournament membership while ending only the active match.
    appRef.current?.giveUp?.();
    enqueueSnackbar({
      message: 'You quit, forfeiting this match.',
      variant: 'warning',
    });
    performMatchTeardown({ refreshDelayMs: 1000 });
  }, [debugLog, performMatchTeardown]);

  useMatchOverEvent({
    canvasRef,
    active: matchPhase === 'playing',
    onMatchOver: () => {
      debugLog('match-over-event');
      performMatchTeardown({ refreshDelayMs: 5000 });
    },
    autoExitDelayMs: 5000,
  });

  return { handleQuitMatch } as const;
}
