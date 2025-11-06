import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';
import type { TournamentSummary } from '../state/types';
import { filterTournamentsForDisplay } from '../domain/filter';

type Options = {
  axios: AxiosInstance;
  userReady: boolean;
  getCurrentTournamentId: () => number | null;
  onError?: (msg: string) => void;
  dispatch: (action: { type: 'setAvailableTournaments'; payload: TournamentSummary[] }) => void;
};

export function useTournamentList({ axios, userReady, getCurrentTournamentId, onError, dispatch }: Options) {
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const loadTournaments = useCallback(async () => {
    if (!userReady) return;
    setLoadingTournaments(true);
    try {
      const { data } = await axios.get('/api/tournaments');
      const rawList = Array.isArray(data) ? (data as TournamentSummary[]) : [];
      const filtered = filterTournamentsForDisplay(rawList, {
        now: Date.now(),
        currentId: getCurrentTournamentId(),
      });
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[TournamentList] load', {
          raw: rawList.length,
          filtered: filtered.length,
          sample: filtered[0] ?? null,
        });
      }
      dispatch({ type: 'setAvailableTournaments', payload: filtered });
    } catch {
      onErrorRef.current?.('Failed to load tournaments list');
    } finally {
      setLoadingTournaments(false);
    }
  }, [axios, getCurrentTournamentId, userReady]);

  return {
    loadingTournaments,
    // availableTournaments are stored in reducer; read via store in controller
    loadTournaments,
    filterTournamentsForDisplay: (list: TournamentSummary[]) =>
      filterTournamentsForDisplay(list, {
        now: Date.now(),
        currentId: getCurrentTournamentId(),
      }),
  } as const;
}
