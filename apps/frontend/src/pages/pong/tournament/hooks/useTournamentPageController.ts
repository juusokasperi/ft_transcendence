import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import type {
  MatchmakingMessage,
  TournamentMatchState,
  TournamentParticipantState,
} from '../net/messageTypes';
import { useSnackbar } from '../../../../context/SnackbarContext';
import { useAppContext } from '../../../../context/AppContext';
import type {
  ActiveHandoff,
  CountdownSnapshot,
  ReadyMatch,
  TournamentSummary,
} from '../state/types';
import { type MatchPhase } from '../domain/countdown';
import { MAX_VISIBLE_TOURNAMENTS, RECENT_TOURNAMENT_WINDOW_MS, TOURNAMENT_SIZE } from '../config';
import { routeMessage } from '../net/router';
import type { MessageCtx } from '../domain/handlers/types';
import { useTournamentConnection } from './useTournamentConnection';
import { useMatchCountdown } from './useMatchCountdown';
import { useMatchLifecycle } from './useMatchLifecycle';
import { useTournamentList } from './useTournamentList';
import { sanitizeAliasInput } from '../../../../utils/alias';
import { tournamentReducer, initialTournamentState } from '../state/tournamentReducer';
import {
  selectMatchesByStage,
  selectSortedParticipants,
  selectCurrentParticipantId,
} from '../state/selectors';
import { useActiveTournament } from './useActiveTournament';

const TOURNAMENT_NAME_MAX_LENGTH = 20;

type TournamentControllerReturn = {
  user: ReturnType<typeof useAppContext>['user'];
  userReady: boolean;
  navigate: ReturnType<typeof useAppContext>['navigate'];
  connectionReady: boolean;
  loadingTournaments: boolean;
  headerLoading: boolean;
  availableTournaments: TournamentSummary[];
  activeTournamentId: number | null;
  activeTournamentName: string | null;
  tournamentStatus: string;
  aliasInput: string;
  setAliasInput: (value: string) => void;
  tournamentName: string;
  setTournamentName: (value: string) => void;
  handleCreateTournamentClick: () => void;
  handleJoinTournamentClick: (tournamentId: number) => void;
  handleLeaveTournamentClick: () => void;
  sortedParticipants: TournamentParticipantState[];
  matchesByStage: TournamentMatchState[];
  latestReadyMatches: ReadyMatch[];
  matchCountdowns: Map<number, CountdownSnapshot>;
  pendingMatch: ReadyMatch | null;
  countdownStatus: CountdownSnapshot['status'] | null;
  countdownSecondsDisplay: number | null;
  matchPhase: MatchPhase;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  handleQuitMatch: () => void;
  isDetailView: boolean;
  headerRefreshHandler: () => Promise<void> | void;
  currentParticipantId: number | null;
};

type UseTournamentPageControllerOptions = {
  focusTournamentId?: number | null;
};

// countdown helpers moved to ../domain/countdown

export function useTournamentPageController(
  options: UseTournamentPageControllerOptions = {},
): TournamentControllerReturn {
  const { enqueueSnackbar } = useSnackbar();
  const { user, userReady, axios, navigate } = useAppContext();
  const location = useLocation();
  const focusTournamentId = options.focusTournamentId ?? null;

  const debugLog = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[TournamentController] ${event}`, payload ?? {});
    }
  }, []);

  // connection handled by useTournamentConnection hook
  const activeTournamentIdRef = useRef<number | null>(null);
  // reducer store for centralized transitions
  const [store, dispatch] = useReducer(tournamentReducer, initialTournamentState);
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const pendingMatchRef = useRef<ReadyMatch | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // connection internals are managed in useTournamentConnection
  // membership bookkeeping via onLobbyUpdated + reducer; no separate ref needed
  const locationRef = useRef(location.pathname);

  // connectionReady is provided by useTournamentConnection below
  const getCurrentTournamentIdForList = useCallback(() => activeTournamentIdRef.current, []);

  const listError = useCallback(
    (msg: string) => enqueueSnackbar({ message: msg, variant: 'error' }),
    [enqueueSnackbar],
  );

  const { loadingTournaments, loadTournaments, filterTournamentsForDisplay } = useTournamentList({
    axios,
    userReady,
    getCurrentTournamentId: getCurrentTournamentIdForList,
    onError: listError,
    dispatch,
  });
  const { refreshTournamentState, setActiveTournamentId, refreshing } = useActiveTournament({
    axios,
    userReady,
    focusTournamentId,
    debugLog,
    onError: (msg) => enqueueSnackbar({ message: msg, variant: 'error' }),
    getActiveTournamentId: useCallback(() => storeRef.current.activeTournamentId, []),
    dispatch,
  });
  const availableTournaments = store.availableTournaments;
  const connectionReady = store.connectionReady;
  const latestReadyMatches = store.latestReadyMatches;
  const pendingMatch = store.pendingMatch;
  const matchCountdowns = store.matchCountdowns;
  const matchPhase = store.matchPhase;
  const participants = store.participants;
  const bracket = store.bracket;
  const activeTournamentId = store.activeTournamentId;
  const activeTournamentName = store.activeTournamentName;
  const tournamentStatus = store.tournamentStatus;
  const maxParticipants = store.maxParticipants;
  const headerLoading = store.activeTournamentId !== null ? refreshing : loadingTournaments;
  const [handoff, setHandoff] = useState<ActiveHandoff | null>(null);
  const [aliasInput, setAliasInputState] = useState('');
  const [tournamentName, setTournamentNameState] = useState('');
  const setAliasInput = useCallback((value: string) => {
    setAliasInputState(sanitizeAliasInput(value));
  }, []);
  const setTournamentName = useCallback((value: string) => {
    setTournamentNameState(value.slice(0, TOURNAMENT_NAME_MAX_LENGTH));
  }, []);
  // Match lifecycle timers handled inside useMatchLifecycle

  useEffect(() => {
    setAliasInputState(sanitizeAliasInput(user?.username ?? ''));
  }, [user?.username]);

  // matchPhase is kept in reducer state

  // availableTournaments ref handled inside useTournamentList

  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    activeTournamentIdRef.current = store.activeTournamentId;
  }, [store.activeTournamentId]);

  useEffect(() => {
    pendingMatchRef.current = store.pendingMatch;
  }, [store.pendingMatch]);

  // loadTournaments, filterTournamentsForDisplay come from the list hook

  useEffect(() => {
    if (!userReady || !user) return;
    debugLog('initial-load', { userUuid: user.uuid });
    loadTournaments();
  }, [debugLog, loadTournaments, userReady, user]);

  const resetLocalActiveTournamentState = useCallback(() => {
    dispatch({ type: 'resetActiveTournamentState' });
    debugLog('reset-active-tournament');
  }, [debugLog, dispatch]);

  // focus handling moved into useActiveTournament

  // refreshTournamentState is provided by useActiveTournament

  const handleMessage = useCallback(
    (msg: MatchmakingMessage) => {
      debugLog('socket-message', { type: msg.type });
      const ctx: MessageCtx = {
        userUuid: user?.uuid ?? null,
        getActiveTournamentId: () => activeTournamentIdRef.current,
        navigate,
        getPathname: () => locationRef.current,
        enqueueSnackbar,
        getAvailableTournaments: () => storeRef.current.availableTournaments,
        setAvailableTournaments: (next) =>
          dispatch({ type: 'setAvailableTournaments', payload: next }),
        filterTournamentsForDisplay: (list) => filterTournamentsForDisplay(list),
        loadTournaments: () => void loadTournaments(),
        refreshTournamentState: (tournamentId?: number) =>
          void refreshTournamentState(tournamentId),
        setTournamentStatus: (status) => {
          const s = storeRef.current;
          dispatch({
            type: 'setActiveTournament',
            payload: {
              id: s.activeTournamentId,
              name: s.activeTournamentName,
              status,
              maxParticipants: s.maxParticipants,
            },
          });
        },
        setMaxParticipants: (v) => {
          const s = storeRef.current;
          dispatch({
            type: 'setActiveTournament',
            payload: {
              id: s.activeTournamentId,
              name: s.activeTournamentName,
              status: s.tournamentStatus,
              maxParticipants: v,
            },
          });
        },
        setActiveTournamentId: (id) => dispatch({ type: 'setActiveTournamentId', payload: id }),
        resetActiveTournamentState: () => resetLocalActiveTournamentState(),
        setParticipants: (list) => dispatch({ type: 'setParticipants', payload: list }),
        setBracket: (list) => dispatch({ type: 'setBracket', payload: list }),
        setLatestReadyMatches: (list) => dispatch({ type: 'setLatestReadyMatches', payload: list }),
        setMatchCountdowns: (updater) => {
          const next = updater(storeRef.current.matchCountdowns);
          dispatch({ type: 'setMatchCountdowns', payload: next });
        },
        setMatchPhase: (phase) => dispatch({ type: 'setMatchPhase', payload: phase }),
        getMatchPhase: () => storeRef.current.matchPhase,
        pendingMatchGet: () => storeRef.current.pendingMatch,
        pendingMatchSet: (match) => {
          dispatch({ type: 'setPendingMatch', payload: match });
        },
        clearCountdown: (matchId) => {
          const prev = storeRef.current.matchCountdowns;
          if (!prev.has(matchId)) return;
          const next = new Map(prev);
          next.delete(matchId);
          dispatch({ type: 'setMatchCountdowns', payload: next });
        },
        setHandoff: (h) => setHandoff(h),
        setConnectionReady: (ready) => dispatch({ type: 'setConnectionReady', payload: ready }),
      };

      routeMessage(msg, ctx);
    },
    [
      debugLog,
      enqueueSnackbar,
      filterTournamentsForDisplay,
      loadTournaments,
      navigate,
      refreshTournamentState,
      resetLocalActiveTournamentState,
      user?.uuid,
    ],
  );

  const getCurrentTournamentId = useCallback(() => activeTournamentIdRef.current, []);

  const { createTournament, joinTournament, leaveTournament } = useTournamentConnection({
    userReady,
    userUuid: user?.uuid ?? null,
    onMessage: handleMessage,
    onSnackbar: enqueueSnackbar,
    debug: debugLog,
    getActiveTournamentId: getCurrentTournamentId,
    setConnectionReady: (ready) => dispatch({ type: 'setConnectionReady', payload: ready }),
  });

  const handleCreateTournamentClick = useCallback(() => {
    createTournament(TOURNAMENT_SIZE, tournamentName, aliasInput);
    setTournamentName('');
    setAliasInput('');
    debugLog('action:create-tournament', { name: tournamentName, alias: aliasInput });
    enqueueSnackbar({ message: 'Tournament creation requested…', variant: 'info' });
  }, [debugLog, enqueueSnackbar, tournamentName, aliasInput, setAliasInput]);

  const handleJoinTournamentClick = useCallback(
    (tournamentId: number) => {
      joinTournament(tournamentId, aliasInput);
      debugLog('action:join-tournament', { tournamentId, alias: aliasInput });
      enqueueSnackbar({ message: 'Join request sent', variant: 'info' });
    },
    [aliasInput, debugLog, enqueueSnackbar],
  );

  const handleLeaveTournamentClick = useCallback(() => {
    if (activeTournamentId === null) return;
    const tournamentId = activeTournamentId;
    leaveTournament(String(tournamentId));
    setActiveTournamentId(null);
    resetLocalActiveTournamentState();
    if (locationRef.current === `/pong/tournaments/${tournamentId}`) {
      locationRef.current = '/pong/tournaments';
      navigate('/pong/tournaments');
    }
    // Proactively refresh the tournaments list so cancelled/empty tournaments
    // are no longer shown in the lobby for this client.
    void loadTournaments();
    debugLog('action:leave-tournament', { tournamentId });
  }, [activeTournamentId, debugLog, loadTournaments, navigate, resetLocalActiveTournamentState]);

  const sortedParticipants = useMemo(() => {
    const stateForSelectors = { ...initialTournamentState, participants, bracket };
    return selectSortedParticipants(stateForSelectors);
  }, [participants, bracket]);

  const currentParticipantId = useMemo(() => {
    const stateForSelectors = { ...initialTournamentState, participants, bracket };
    return selectCurrentParticipantId(stateForSelectors, user?.uuid ?? null);
  }, [participants, bracket, user?.uuid]);

  const matchesByStage = useMemo(() => {
    const stateForSelectors = { ...initialTournamentState, participants, bracket };
    return selectMatchesByStage(stateForSelectors);
  }, [participants, bracket]);

  const isDetailView = activeTournamentId !== null;
  const headerRefreshHandler = isDetailView ? refreshTournamentState : loadTournaments;

  const { countdownStatus, countdownSecondsDisplay } = useMatchCountdown({
    pendingMatch,
    matchCountdowns,
  });

  const setMatchPhase = useCallback((phase: MatchPhase) => {
    dispatch({ type: 'setMatchPhase', payload: phase });
  }, []);

  const { handleQuitMatch } = useMatchLifecycle({
    matchPhase,
    setMatchPhase,
    handoff,
    setHandoff,
    canvasRef,
    refreshTournamentState,
    debugLog,
    enqueueSnackbar,
  });

  return {
    user,
    userReady,
    navigate,
    connectionReady,
    loadingTournaments,
    headerLoading,
    availableTournaments,
    activeTournamentId,
    activeTournamentName,
    tournamentStatus,
    aliasInput,
    setAliasInput,
    tournamentName,
    setTournamentName,
    handleCreateTournamentClick,
    handleJoinTournamentClick,
    handleLeaveTournamentClick,
    sortedParticipants,
    matchesByStage,
    latestReadyMatches,
    matchCountdowns,
    pendingMatch,
    countdownStatus,
    countdownSecondsDisplay,
    matchPhase,
    canvasRef,
    handleQuitMatch,
    isDetailView,
    headerRefreshHandler,
    currentParticipantId,
  };
}
