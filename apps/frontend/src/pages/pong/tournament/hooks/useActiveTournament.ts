import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';
import type { TournamentMatchState } from '../net/messageTypes';
import type { TournamentSummary } from '../state/types';

type Options = {
  axios: AxiosInstance;
  userReady: boolean;
  focusTournamentId: number | null;
  debugLog: (e: string, p?: Record<string, unknown>) => void;
  onError: (msg: string) => void;
  getActiveTournamentId: () => number | null;
  dispatch: (action:
    | { type: 'setActiveTournamentId'; payload: number | null }
    | { type: 'resetActiveTournamentState' }
    | { type: 'setActiveTournament'; payload: { id: number | null; name: string | null; status: string; maxParticipants: number | null } }
    | { type: 'setParticipants'; payload: any[] }
    | { type: 'setBracket'; payload: TournamentMatchState[] }
  ) => void;
};

export function useActiveTournament({ axios, userReady, focusTournamentId, debugLog, onError, getActiveTournamentId, dispatch }: Options) {
  const focusStateRef = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const getActiveIdRef = useRef(getActiveTournamentId);
  useEffect(() => {
    getActiveIdRef.current = getActiveTournamentId;
  }, [getActiveTournamentId]);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const resetActiveTournamentState = useCallback(() => {
    dispatch({ type: 'resetActiveTournamentState' });
    debugLog('reset-active-tournament');
  }, [debugLog, dispatch]);

  useEffect(() => {
    if (focusTournamentId === null) {
      focusStateRef.current = null;
      return;
    }
    if (focusStateRef.current === focusTournamentId) return;
    focusStateRef.current = focusTournamentId;
    if (getActiveIdRef.current() === focusTournamentId) return;
    resetActiveTournamentState();
    dispatch({ type: 'setActiveTournamentId', payload: focusTournamentId });
    debugLog('focus-change', { focusTournamentId });
  }, [debugLog, dispatch, focusTournamentId, resetActiveTournamentState]);

  const refreshTournamentState = useCallback(async () => {
    const activeTournamentId = getActiveIdRef.current();
    if (!activeTournamentId || !userReady) return;
    try {
      setRefreshing(true);
      debugLog('refresh-tournament-state:start', { tournamentId: activeTournamentId });
      const { getTournamentSnapshot } = await import('../api/tournamentApi');
      const snapshot = await getTournamentSnapshot(axios, activeTournamentId);

      dispatch({
        type: 'setActiveTournament',
        payload: {
          id: activeTournamentId,
          name: snapshot.meta.name ?? null,
          status: snapshot.meta.status,
          maxParticipants: snapshot.meta.maxParticipants ?? 4,
        },
      });

      dispatch({
        type: 'setParticipants',
        payload: snapshot.participants.map((participant) => ({
          participantId: participant.id,
          alias: participant.alias,
          seed: participant.seed,
          status: participant.status,
          userUuid: participant.userUuid,
        })),
      });

      dispatch({ type: 'setBracket', payload: snapshot.matches as TournamentMatchState[] });
      debugLog('refresh-tournament-state:success', {
        tournamentId: activeTournamentId,
        participants: snapshot.participants.length,
        matches: snapshot.matches.length,
      });
    } catch (error) {
      debugLog('refresh-tournament-state:error', { tournamentId: getActiveIdRef.current(), error });
      onErrorRef.current('Failed to refresh tournament state');
    } finally {
      setRefreshing(false);
    }
  }, [axios, debugLog, dispatch, userReady]);

  useEffect(() => {
    if (!getActiveIdRef.current()) return;
    void refreshTournamentState();
  }, [refreshTournamentState]);

  return {
    refreshTournamentState,
    setActiveTournamentId: (id: number | null) => dispatch({ type: 'setActiveTournamentId', payload: id }),
    resetActiveTournamentState,
    refreshing,
  } as const;
}
