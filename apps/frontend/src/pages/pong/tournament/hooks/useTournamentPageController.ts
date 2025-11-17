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
import { useSetMatchActivity } from '../../../../context/MatchActivityContext';
import type {
  ActiveHandoff,
  CountdownSnapshot,
  ReadyMatch,
  TournamentSummary,
} from '../state/types';
import { type MatchPhase } from '../domain/countdown';
import { TOURNAMENT_SIZE } from '../config';
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
  forfeitedParticipantIds: Set<number>;
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
  const setMatchActive = useSetMatchActivity();
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

  // no local ref tracking for pendingMatch required; reducer state is the source of truth

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
        markForfeited: (ids) => dispatch({ type: 'markParticipantsForfeited', payload: ids }),
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
    enqueueSnackbar({ message: 'Creating tournament.', variant: 'info' });
  }, [debugLog, enqueueSnackbar, tournamentName, aliasInput, setAliasInput]);

  const handleJoinTournamentClick = useCallback(
    (tournamentId: number) => {
      joinTournament(tournamentId, aliasInput);
      debugLog('action:join-tournament', { tournamentId, alias: aliasInput });
      enqueueSnackbar({ message: 'Joining tournament.', variant: 'info' });
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
  const matchActive = matchPhase === 'starting' || matchPhase === 'playing';

  useEffect(() => {
    setMatchActive(matchActive);
    return () => setMatchActive(false);
  }, [matchActive, setMatchActive]);

  const { countdownStatus, countdownSecondsDisplay } = useMatchCountdown({
    pendingMatch,
    matchCountdowns,
  });

  const setMatchPhase = useCallback((phase: MatchPhase) => {
    dispatch({ type: 'setMatchPhase', payload: phase });
  }, []);

  const skipAutoResumeRef = useRef(false);

  const { handleQuitMatch: handleQuitMatchInner } = useMatchLifecycle({
    matchPhase,
    setMatchPhase,
    handoff,
    setHandoff,
    canvasRef,
    refreshTournamentState,
    debugLog,
    enqueueSnackbar,
  });

  const handleQuitMatch = useCallback(() => {
    skipAutoResumeRef.current = true;
    const roomId = handoff?.roomIdentifier;
    if (roomId) {
      // Clear any stored resume tokens for this room when the user intentionally quits.
      // This mirrors online flow semantics and prevents immediate auto-resume loops.
      (async () => {
        try {
          const { clearStoredResumeTokens } = await import(
            '../../../../games/pong/modes/online/resume'
          );
          clearStoredResumeTokens(roomId);
          debugLog('auto-resume:cleared-on-quit', { roomIdentifier: roomId });
        } catch {}
      })();
    }
    handleQuitMatchInner();
  }, [debugLog, handoff?.roomIdentifier, handleQuitMatchInner]);

  // Auto-resume support: if the user lands on a tournament detail view while having
  // a valid resume token in sessionStorage (from an in-progress match), automatically
  // bootstrap the game using that token. This mirrors the OnlineGame behavior, but is
  // scoped to the tournament page so it does not affect regular online gameplay.
  useEffect(() => {
    // Only in tournament detail view with a signed-in user
    if (!userReady || !user) return;
    if (activeTournamentId === null) return;
    if (tournamentStatus === 'completed') return;
    // Do not interfere if we are already starting/playing or have a live handoff
    if (matchPhase === 'starting' || matchPhase === 'playing') return;
    if (handoff) return;
    if (skipAutoResumeRef.current) return;

    // Find any stored resume token; tokens are short-lived and cleared on match end/forfeit,
    // so the presence of a token strongly indicates an in-progress match.
    (async () => {
      try {
        const { findAnyStoredResumeCandidate } = await import(
          '../../../../games/pong/modes/online/resume'
        );
        const candidate = findAnyStoredResumeCandidate();
        if (!candidate) return;

        // Seed a synthetic handoff so the lifecycle hook boots the game. Seat and joinToken
        // are placeholders; the online bootstrap will switch to resume mode using the token
        // stored for this room.
        setHandoff({
          matchId: 'resume',
          roomIdentifier: candidate.roomIdentifier,
          gameServerWSUrl: `/g/${candidate.roomIdentifier}`,
          joinToken: '',
          randomSeed: 0,
          side: 'east',
        });
        setMatchPhase('starting');
        debugLog('auto-resume:attempt', {
          tournamentId: activeTournamentId,
          roomIdentifier: candidate.roomIdentifier,
        });
      } catch (err) {
        // Fail silently; auto-resume is best-effort
        if (import.meta.env?.DEV) {
          // eslint-disable-next-line no-console
          console.debug('[TournamentController] auto-resume unavailable', err);
        }
      }
    })();
  }, [
    activeTournamentId,
    debugLog,
    handoff,
    matchPhase,
    setHandoff,
    setMatchPhase,
    tournamentStatus,
    user,
    userReady,
  ]);

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
    forfeitedParticipantIds: store.forfeitedParticipantIds,
  };
}
