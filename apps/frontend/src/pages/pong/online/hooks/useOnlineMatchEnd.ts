import { useCallback, useEffect, useRef } from 'react';
import type { OnlineAction } from '../../online/state/machine';
import type { MatchEndPayload } from '../../online/state/types';

type UseOnlineMatchEndArgs = {
  seat: 'P1' | 'P2';
  dispatch: React.Dispatch<OnlineAction>;
  enqueueSnackbar: (opts: { message: string; variant?: 'info' | 'success' | 'error' }) => unknown;
  delayMs?: number; // delay before showing React PostMatch view on completed match
};

export function useOnlineMatchEnd({
  seat,
  dispatch,
  enqueueSnackbar,
  delayMs = 2500,
}: UseOnlineMatchEndArgs) {
  const timerRef = useRef<number | null>(null);

  const handleMatchEnd = useCallback(
    (payload: MatchEndPayload) => {
      if (payload.reason === 'bootstrap_failed') {
        enqueueSnackbar({
          message: 'Unable to start the match. Please try again.',
          variant: 'error',
        });
      }

      if (payload.reason === 'opponent_timeout' && payload.winner) {
        const youWon =
          (seat === 'P1' && payload.winner === 'east') ||
          (seat === 'P2' && payload.winner === 'west');
        enqueueSnackbar({
          message: youWon
            ? 'You won! Opponent disconnected.'
            : 'Match ended. Opponent disconnected.',
          variant: youWon ? 'success' : 'info',
        });
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
    [dispatch, enqueueSnackbar, seat, delayMs],
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
