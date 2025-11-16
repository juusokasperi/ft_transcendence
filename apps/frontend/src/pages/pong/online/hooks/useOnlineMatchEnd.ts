import { useCallback, useEffect, useRef } from 'react';
import type { OnlineAction } from '../../online/state/machine';
import type { MatchEndPayload } from '../../online/state/types';

type UseOnlineMatchEndArgs = {
  seat: 'P1' | 'P2';
  dispatch: React.Dispatch<OnlineAction>;
  enqueueSnackbar: (opts: { message: string; variant?: 'info' | 'success' | 'error' }) => unknown;
  delayMs?: number; // delay before showing React PostMatch view on completed match
};

export function useOnlineMatchEnd(
  { seat, dispatch, enqueueSnackbar, delayMs = 2500 }: UseOnlineMatchEndArgs,
  onBootstrapFailed?: () => void,
) {
  const timerRef = useRef<number | null>(null);

  const handleMatchEnd = useCallback(
    (payload: MatchEndPayload) => {
      if (payload.reason === 'bootstrap_failed') {
        enqueueSnackbar({
          message: 'Unable to start the match. Please try again.',
          variant: 'error',
        });
        try {
          onBootstrapFailed?.();
        } catch {}
      }

      if (payload.reason === 'forfeit') {
        // UI overlay already communicates forfeit; avoid duplicate snackbar.
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          if (payload.summary) {
            dispatch({ type: 'showPostMatch', summary: payload.summary });
          } else {
            dispatch({ type: 'endMatch', payload });
          }
          timerRef.current = null;
        }, 5000);
        return;
      }

      if (payload.reason === 'opponent_timeout') {
        const youWon = payload.winner
          ? (seat === 'P1' && payload.winner === 'east') ||
            (seat === 'P2' && payload.winner === 'west')
          : false;
        enqueueSnackbar({
          message: youWon
            ? 'You won by opponent disconnect. Showing results…'
            : 'Match ended due to disconnect. Showing results…',
          variant: youWon ? 'success' : 'info',
        });
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          if (payload.summary) {
            dispatch({ type: 'showPostMatch', summary: payload.summary });
          } else {
            dispatch({ type: 'endMatch', payload });
          }
          timerRef.current = null;
        }, 5000);
        return;
      }

      if (payload.reason === 'completed' && payload.summary) {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(
          () => {
            dispatch({ type: 'showPostMatch', summary: payload.summary! });
            timerRef.current = null;
          },
          Math.max(0, delayMs | 0),
        );
        return;
      }

      dispatch({ type: 'endMatch', payload });
    },
    [dispatch, enqueueSnackbar, seat, delayMs, onBootstrapFailed],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { handleMatchEnd } as const;
}
