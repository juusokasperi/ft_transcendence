import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { createMatchmakingClient } from '../../../services/matchmaking';
import type {
  HandoffTimeoutMessage,
  MatchmakingMessage,
  TournamentMatchState,
  TournamentParticipantState,
} from '@pong/shared/protocol/net';
import { useSnackbar } from '../../../context/SnackbarContext';
import { useAppContext } from '../../../context/AppContext';
import type { ActiveHandoff, CountdownSnapshot, ReadyMatch, TournamentSummary } from '../components/types';

const TOURNAMENT_SIZE = 4;
const RECENT_TOURNAMENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_VISIBLE_TOURNAMENTS = 8;

type MatchPhase = 'idle' | 'awaiting_start' | 'starting' | 'playing';

type TournamentControllerReturn = {
  user: ReturnType<typeof useAppContext>['user'];
  userReady: boolean;
  navigate: ReturnType<typeof useAppContext>['navigate'];
  connectionReady: boolean;
  loadingTournaments: boolean;
  availableTournaments: TournamentSummary[];
  activeTournamentId: number | null;
  tournamentStatus: string;
  aliasInput: string;
  setAliasInput: (value: string) => void;
  tournamentName: string;
  setTournamentName: (value: string) => void;
  handleCreateTournamentClick: () => void;
  handleJoinTournamentClick: (tournamentId: number) => void;
  handleLeaveTournamentClick: () => void;
  handleForfeitTournamentClick: () => void;
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

  const clientRef = useRef<ReturnType<typeof createMatchmakingClient> | null>(null);
  const activeTournamentIdRef = useRef<number | null>(null);
  const pendingMatchRef = useRef<ReadyMatch | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<{ destroy(): void } | null>(null);
  const manualCloseRef = useRef(false);
  const connectionErrorShownRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectionStateRef = useRef<'idle' | 'connecting' | 'open'>('idle');
  const backoffDelayRef = useRef(1500);
  const lastDisconnectRef = useRef<number | null>(null);
  const focusStateRef = useRef<number | null>(null);
  const membershipRef = useRef<{ member: boolean; tournamentId: number | null }>({
    member: false,
    tournamentId: null,
  });
  const locationRef = useRef(location.pathname);

  const [connectionReady, setConnectionReady] = useState(false);
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [availableTournaments, setAvailableTournaments] = useState<TournamentSummary[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState<number | null>(null);
  const [tournamentStatus, setTournamentStatus] = useState<string>('draft');
  const [maxParticipants, setMaxParticipants] = useState<number | null>(null);
  const [participants, setParticipants] = useState<TournamentParticipantState[]>([]);
  const [bracket, setBracket] = useState<TournamentMatchState[]>([]);
  const [latestReadyMatches, setLatestReadyMatches] = useState<ReadyMatch[]>([]);
  const [pendingMatch, setPendingMatch] = useState<ReadyMatch | null>(null);
  const [matchCountdowns, setMatchCountdowns] = useState<Map<number, CountdownSnapshot>>(new Map());
  const [matchPhase, setMatchPhase] = useState<MatchPhase>('idle');
  const [localCountdownSeconds, setLocalCountdownSeconds] = useState<number | null>(null);
  const [handoff, setHandoff] = useState<ActiveHandoff | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const rejoinTimerRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setAliasInput(user?.username ?? '');
  }, [user?.username]);

  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    activeTournamentIdRef.current = activeTournamentId;
  }, [activeTournamentId]);

  useEffect(() => {
    pendingMatchRef.current = pendingMatch;
  }, [pendingMatch]);

  const filterTournamentsForDisplay = useCallback((incoming: TournamentSummary[]): TournamentSummary[] => {
    const parseTimestamp = (value?: string | null): number | null => {
      if (!value) return null;
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const resolveTimestamp = (item: TournamentSummary): number | null => {
      const candidates: Array<string | null | undefined> = [item.updatedAt, item.startAt, item.createdAt];
      for (const candidate of candidates) {
        const parsed = parseTimestamp(candidate);
        if (parsed !== null) return parsed;
      }
      return null;
    };

    const byStatus = incoming.filter((tournament) => ['draft', 'active'].includes(tournament.status));
    if (byStatus.length === 0) return [];

    const unique = new Map<number, TournamentSummary>();
    byStatus.forEach((item) => {
      const existing = unique.get(item.id);
      if (!existing) {
        unique.set(item.id, item);
        return;
      }
      const existingTime = resolveTimestamp(existing) ?? Number.NEGATIVE_INFINITY;
      const candidateTime = resolveTimestamp(item) ?? Number.NEGATIVE_INFINITY;
      if (candidateTime >= existingTime) {
        unique.set(item.id, item);
      }
    });

    const now = Date.now();
    const currentId = activeTournamentIdRef.current;

    const recent: TournamentSummary[] = [];
    const fallbackPool: TournamentSummary[] = [];

    for (const item of unique.values()) {
      const timestamp = resolveTimestamp(item);
      const isCurrent = currentId !== null && item.id === currentId;
      const isRecent = timestamp !== null && now - timestamp <= RECENT_TOURNAMENT_WINDOW_MS;
      if (isCurrent || isRecent) {
        recent.push(item);
      } else {
        fallbackPool.push(item);
      }
    }

    const sortByTimestampDesc = (left: TournamentSummary, right: TournamentSummary) => {
      const leftTs = resolveTimestamp(left);
      const rightTs = resolveTimestamp(right);
      if (leftTs === null && rightTs === null) return 0;
      if (leftTs === null) return 1;
      if (rightTs === null) return -1;
      return rightTs - leftTs;
    };

    recent.sort(sortByTimestampDesc);
    fallbackPool.sort(sortByTimestampDesc);

    if (recent.length >= MAX_VISIBLE_TOURNAMENTS) {
      return recent.slice(0, MAX_VISIBLE_TOURNAMENTS);
    }

    const combined = [...recent];
    for (const item of fallbackPool) {
      combined.push(item);
      if (combined.length >= MAX_VISIBLE_TOURNAMENTS) break;
    }

    return combined;
  }, []);

  const loadTournaments = useCallback(async () => {
    if (!userReady) return;
    setLoadingTournaments(true);
    try {
      const { data } = await axios.get('/api/tournaments');
      const rawList = Array.isArray(data) ? (data as TournamentSummary[]) : [];
      setAvailableTournaments(filterTournamentsForDisplay(rawList));
    } catch (error) {
      enqueueSnackbar({
        message: 'Failed to load tournaments list',
        variant: 'error',
      });
    } finally {
      setLoadingTournaments(false);
    }
  }, [axios, enqueueSnackbar, filterTournamentsForDisplay, userReady]);

  useEffect(() => {
    if (!userReady || !user) return;
    debugLog('initial-load', { userUuid: user.uuid });
    loadTournaments();
  }, [debugLog, loadTournaments, userReady, user]);

  const resetActiveTournamentState = useCallback(() => {
    setParticipants([]);
    setBracket([]);
    setPendingMatch(null);
    pendingMatchRef.current = null;
    setMatchCountdowns(new Map());
    setLatestReadyMatches([]);
    setTournamentStatus('draft');
    setMaxParticipants(null);
    debugLog('reset-active-tournament');
  }, [debugLog]);

  useEffect(() => {
    if (focusTournamentId === null) {
      focusStateRef.current = null;
      return;
    }
    if (focusStateRef.current === focusTournamentId) return;
    focusStateRef.current = focusTournamentId;
    if (activeTournamentIdRef.current === focusTournamentId) return;
    resetActiveTournamentState();
    setActiveTournamentId(focusTournamentId);
    debugLog('focus-change', { focusTournamentId });
  }, [debugLog, focusTournamentId, resetActiveTournamentState]);

  const refreshTournamentState = useCallback(async () => {
    if (!activeTournamentId || !userReady) return;

    try {
      debugLog('refresh-tournament-state:start', { tournamentId: activeTournamentId });
      const [tournamentRes, participantsRes, matchesRes] = await Promise.all([
        axios.get(`/api/tournaments/${activeTournamentId}`),
        axios.get(`/api/tournaments/${activeTournamentId}/participants`),
        axios.get(`/api/tournaments/${activeTournamentId}/matches`),
      ]);

      const tournamentData = tournamentRes.data as {
        status: string;
        maxParticipants: number | null;
      };

      setTournamentStatus(tournamentData.status);
      setMaxParticipants(tournamentData.maxParticipants ?? TOURNAMENT_SIZE);

      const participantPayload = participantsRes.data as Array<{
        id: number;
        alias: string;
        seed: number | null;
        status: string;
        userUuid: string | null;
      }>;

      setParticipants(
        participantPayload.map((participant) => ({
          participantId: participant.id,
          alias: participant.alias,
          seed: participant.seed,
          status: participant.status,
          userUuid: participant.userUuid,
        })),
      );

      const participantMap = new Map(participantPayload.map((participant) => [participant.id, participant]));

      const matchPayload = matchesRes.data as Array<{
        id: number;
        roundNumber: number;
        roundPosition: number;
        status: string;
        scheduledAt: string | null;
        completedAt: string | null;
        matchId: number | null;
      }>;

      const matches = (await Promise.all(
        matchPayload.map(async (match) => {
          const playersRes = await axios.get(
            `/api/tournaments/${activeTournamentId}/matches/${match.id}/players`,
          );
          const players = (playersRes.data as Array<{ participantId: number; teamNumber: number }>).map((player) => {
            const participant = participantMap.get(player.participantId);
            return {
              participantId: player.participantId,
              teamNumber: player.teamNumber,
              alias: participant?.alias ?? 'Unknown',
              status: participant?.status ?? 'pending',
            };
          });

          return {
            tournamentMatchId: match.id,
            roundNumber: match.roundNumber,
            roundPosition: match.roundPosition,
            status: match.status,
            scheduledAt: match.scheduledAt,
            completedAt: match.completedAt,
            matchId: match.matchId,
            players,
          } satisfies TournamentMatchState;
        }),
      )) as TournamentMatchState[];

      setBracket(matches);
      debugLog('refresh-tournament-state:success', {
        tournamentId: activeTournamentId,
        participants: participantPayload.length,
        matches: matches.length,
      });
    } catch (error) {
      debugLog('refresh-tournament-state:error', {
        tournamentId: activeTournamentId,
        error,
      });
      enqueueSnackbar({ message: 'Failed to refresh tournament state', variant: 'error' });
    }
  }, [activeTournamentId, axios, debugLog, enqueueSnackbar, userReady]);

  useEffect(() => {
    if (!activeTournamentId) return;
    void refreshTournamentState();
  }, [activeTournamentId, refreshTournamentState]);

  const handleMessage = useCallback(
    (msg: MatchmakingMessage) => {
      debugLog('socket-message', { type: msg.type });
      switch (msg.type) {
        case 'CONNECTED':
          setConnectionReady(true);
          debugLog('socket-event:connected');
          break;
        case 'ERROR':
          debugLog('socket-event:error', { code: msg.code, message: msg.message });
          enqueueSnackbar({ message: msg.message ?? 'Tournament error', variant: 'error' });
          if (msg.code === 'AUTH') navigate('/login');
          if (msg.code === 'TOURNAMENT_API') {
            loadTournaments();
          }
          break;
        case 'TOURNAMENT_LOBBY_UPDATED': {
          debugLog('socket-event:lobby-update', {
            tournamentId: msg.tournamentId,
            status: msg.status,
            participants: msg.participants.length,
          });
          setTournamentStatus(msg.status);
          setMaxParticipants(msg.maxParticipants ?? TOURNAMENT_SIZE);
          setParticipants(msg.participants);

          const userUuid = user?.uuid;
          const member = userUuid
            ? msg.participants.some((participant) => participant.userUuid === userUuid)
            : false;

          if (member) {
            setActiveTournamentId(msg.tournamentId);
            debugLog('membership:update', { member: true, tournamentId: msg.tournamentId });
          } else if (activeTournamentIdRef.current === msg.tournamentId) {
            setActiveTournamentId(null);
            resetActiveTournamentState();
            debugLog('membership:update', { member: false, tournamentId: msg.tournamentId });
          }

          const detailPath = `/ping-pong/tournaments/${msg.tournamentId}`;
          const previousMembership = membershipRef.current;
          if (member && (!previousMembership.member || previousMembership.tournamentId !== msg.tournamentId)) {
            if (locationRef.current !== detailPath) {
              navigate(detailPath);
            }
          } else if (
            !member &&
            previousMembership.member &&
            previousMembership.tournamentId === msg.tournamentId &&
            locationRef.current === detailPath
          ) {
            navigate('/ping-pong/tournaments');
          }

          membershipRef.current = {
            member,
            tournamentId: member ? msg.tournamentId : null,
          };
          debugLog('membership:state', membershipRef.current);

          let needsRefresh = false;
          setAvailableTournaments((prev) => {
            const next = prev.slice();
            const index = next.findIndex((item) => item.id === msg.tournamentId);
            const timestamp = new Date().toISOString();
            if (index === -1) {
              next.push({
                id: msg.tournamentId,
                name: `Tournament #${msg.tournamentId}`,
                status: msg.status,
                maxParticipants: msg.maxParticipants ?? TOURNAMENT_SIZE,
                updatedAt: timestamp,
              });
              needsRefresh = true;
            } else {
              const existing = next[index]!;
              next[index] = {
                ...existing,
                status: msg.status,
                maxParticipants: msg.maxParticipants ?? existing.maxParticipants ?? TOURNAMENT_SIZE,
                updatedAt: timestamp,
              };
            }
            return filterTournamentsForDisplay(next);
          });
          if (needsRefresh) {
            void loadTournaments();
          }
          break;
        }
        case 'TOURNAMENT_BRACKET_SNAPSHOT': {
          debugLog('socket-event:bracket-snapshot', { matches: msg.matches.length });
          setBracket(msg.matches);
          break;
        }
        case 'TOURNAMENT_MATCHES_READY': {
          debugLog('socket-event:matches-ready', { matches: msg.matches.length });
          setLatestReadyMatches(msg.matches);
          void refreshTournamentState();

          setMatchCountdowns((prev) => {
            const activeIds = new Set(msg.matches.map((match) => match.tournamentMatchId));
            let changed = false;
            const next = new Map<number, CountdownSnapshot>();
            for (const [key, value] of prev.entries()) {
              if (activeIds.has(key)) {
                next.set(key, value);
              } else {
                changed = true;
              }
            }
            return changed ? next : prev;
          });

          const userUuid = user?.uuid;
          if (userUuid) {
            const personal = msg.matches.find((match) =>
              match.participants.some((participant) => participant.userUuid === userUuid),
            );
            if (personal) {
              pendingMatchRef.current = personal;
              setPendingMatch(personal);
              setMatchPhase((phase) =>
                phase === 'starting' || phase === 'playing' ? phase : 'awaiting_start',
              );
              debugLog('pending-match:assigned', {
                tournamentMatchId: personal.tournamentMatchId,
              });
            } else {
              pendingMatchRef.current = null;
              setPendingMatch(null);
              debugLog('pending-match:cleared');
            }
          } else {
            pendingMatchRef.current = null;
            setPendingMatch(null);
            debugLog('pending-match:cleared-no-user');
          }
          break;
        }
        case 'TOURNAMENT_MATCH_COUNTDOWN': {
          const payload = msg;
          if (activeTournamentIdRef.current !== payload.tournamentId) break;

          debugLog('socket-event:countdown', {
            tournamentId: payload.tournamentId,
            tournamentMatchId: payload.tournamentMatchId,
            status: payload.status,
            secondsRemaining: payload.secondsRemaining,
          });

          setMatchCountdowns((prev) => {
            const next = new Map(prev);
            next.set(payload.tournamentMatchId, {
              tournamentMatchId: payload.tournamentMatchId,
              tournamentId: payload.tournamentId,
              stage: payload.stage,
              status: payload.status,
              targetStartEpochMs: payload.targetStartEpochMs,
              secondsRemaining: payload.secondsRemaining,
            });
            return next;
          });

          const personalMatchId = pendingMatchRef.current?.tournamentMatchId;
          if (personalMatchId === payload.tournamentMatchId) {
            if (payload.status === 'started') {
              setMatchPhase((phase) => (phase === 'playing' ? phase : 'starting'));
            } else if (payload.status === 'cancelled') {
              setMatchPhase((phase) =>
                phase === 'starting' || phase === 'playing' ? phase : 'awaiting_start',
              );
            } else {
              setMatchPhase((phase) =>
                phase === 'starting' || phase === 'playing' ? phase : 'awaiting_start',
              );
            }
          }
          break;
        }
        case 'HANDOFF': {
          const currentTournamentId = activeTournamentIdRef.current;
          debugLog('socket-event:handoff', {
            tournamentId: msg.tournament?.tournamentId ?? null,
            matchId: msg.matchId,
          });
          if (msg.tournament && msg.tournament.tournamentId === currentTournamentId) {
            const previousMatchId = pendingMatchRef.current?.tournamentMatchId;
            setPendingMatch(null);
            pendingMatchRef.current = null;
            if (typeof previousMatchId === 'number') {
              setMatchCountdowns((prev) => {
                if (!prev.has(previousMatchId)) return prev;
                const next = new Map(prev);
                next.delete(previousMatchId);
                return next;
              });
            }
            setMatchPhase('starting');
            setHandoff({
              matchId: msg.matchId,
              roomIdentifier: msg.roomIdentifier,
              gameServerWSUrl: msg.gameServerWSUrl,
              joinToken: msg.joinToken,
              randomSeed: msg.randomSeed,
              side: msg.side,
            });
          }
          break;
        }
        case 'HANDOFF_TIMEOUT': {
          const payload = msg as HandoffTimeoutMessage;
          debugLog('socket-event:handoff-timeout', {
            tournamentId: 'tournamentId' in payload ? (payload as { tournamentId?: number }).tournamentId ?? null : null,
            message: payload.message ?? null,
          });
          const previousMatchId = pendingMatchRef.current?.tournamentMatchId;
          enqueueSnackbar({ message: payload.message ?? 'Match handoff timed out', variant: 'error' });
          setMatchPhase('idle');
          pendingMatchRef.current = null;
          setPendingMatch(null);
          setMatchCountdowns((prev) => {
            if (typeof previousMatchId !== 'number' || !prev.has(previousMatchId)) return prev;
            const next = new Map(prev);
            next.delete(previousMatchId);
            return next;
          });
          break;
        }
        default:
          debugLog('socket-event:unhandled', { type: msg.type });
          break;
      }
    },
    [debugLog, enqueueSnackbar, filterTournamentsForDisplay, loadTournaments, navigate, refreshTournamentState, resetActiveTournamentState, user?.uuid],
  );

  useEffect(() => {
    if (!userReady || !user) return;

    manualCloseRef.current = false;
    connectionStateRef.current = 'idle';
    backoffDelayRef.current = 1500;
    setConnectionReady(false);
    debugLog('connection:effect-mounted', { userUuid: user.uuid });

    const DEFAULT_RECONNECT_DELAY = 1500;
    const MAX_RECONNECT_DELAY = 10000;
    const MIN_COOLDOWN_MS = 300;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
        debugLog('connection:timer-cleared');
      }
    };

    const computeDelayWithCooldown = (requestedDelay: number) => {
      let delay = requestedDelay;
      if (lastDisconnectRef.current !== null) {
        const elapsed = Date.now() - lastDisconnectRef.current;
        if (elapsed < MIN_COOLDOWN_MS) {
          delay = Math.max(delay, MIN_COOLDOWN_MS - elapsed);
        }
      }
      return delay;
    };

    const queueReconnect = () => {
      if (manualCloseRef.current) return;
      if (reconnectTimerRef.current !== null) return;
      connectionStateRef.current = 'idle';
      const delay = backoffDelayRef.current;
      backoffDelayRef.current = Math.min(Math.floor(backoffDelayRef.current * 1.8), MAX_RECONNECT_DELAY);
      debugLog('connection:queue-reconnect', { delay });
      startConnection(delay);
    };

    function startConnection(requestedDelay = 0) {
      if (manualCloseRef.current) return;
      if (connectionStateRef.current !== 'idle') return;
      if (reconnectTimerRef.current !== null) return;

      const delay = computeDelayWithCooldown(requestedDelay);
      debugLog('connection:start-requested', { requestedDelay, delay });

      const begin = () => {
        reconnectTimerRef.current = null;
        if (manualCloseRef.current) return;

        connectionStateRef.current = 'connecting';
        debugLog('connection:opening');
        const client = createMatchmakingClient(handleMessage, {
          onOpen: () => {
            connectionStateRef.current = 'open';
            backoffDelayRef.current = DEFAULT_RECONNECT_DELAY;
            connectionErrorShownRef.current = false;
            setConnectionReady(true);
            debugLog('connection:open');
          },
          onError: () => {
            if (manualCloseRef.current) return;
            connectionStateRef.current = 'idle';
            lastDisconnectRef.current = Date.now();
            setConnectionReady(false);
            if (!connectionErrorShownRef.current) {
              enqueueSnackbar({ message: 'Tournament connection error. Retrying…', variant: 'error' });
              connectionErrorShownRef.current = true;
            }
            debugLog('connection:error');
            queueReconnect();
          },
          onClose: (event) => {
            setConnectionReady(false);
            if (manualCloseRef.current) return;
            connectionStateRef.current = 'idle';
            lastDisconnectRef.current = Date.now();
            const abnormal = !event.wasClean && event.code !== 1000;
            if (abnormal && !connectionErrorShownRef.current) {
              enqueueSnackbar({ message: 'Tournament connection lost. Reconnecting…', variant: 'warning' });
              connectionErrorShownRef.current = true;
            }
            debugLog('connection:closed', {
              wasClean: event.wasClean,
              code: event.code,
              reason: event.reason,
            });
            queueReconnect();
          },
        });

        clientRef.current = client;
      };

      if (delay > 0) {
        reconnectTimerRef.current = window.setTimeout(begin, delay);
        debugLog('connection:timer-set', { delay });
      } else {
        begin();
      }
    }

    startConnection();

    return () => {
      manualCloseRef.current = true;
      connectionStateRef.current = 'idle';
      backoffDelayRef.current = DEFAULT_RECONNECT_DELAY;
      clearReconnectTimer();
      setConnectionReady(false);
      const client = clientRef.current;
      if (client) {
        if (activeTournamentIdRef.current) {
          client.leaveTournament(String(activeTournamentIdRef.current));
        }
        client.close();
        debugLog('connection:cleanup-close', { tournamentId: activeTournamentIdRef.current });
        clientRef.current = null;
      }
      lastDisconnectRef.current = Date.now();
      debugLog('connection:effect-unmounted');
    };
  }, [debugLog, enqueueSnackbar, handleMessage, user, userReady]);

  const handleCreateTournamentClick = useCallback(() => {
    if (!clientRef.current) return;
    clientRef.current.createTournament(TOURNAMENT_SIZE, tournamentName);
    setTournamentName('');
    debugLog('action:create-tournament', { name: tournamentName });
    enqueueSnackbar({ message: 'Tournament creation requested…', variant: 'info' });
  }, [debugLog, enqueueSnackbar, tournamentName]);

  const handleJoinTournamentClick = useCallback(
    (tournamentId: number) => {
      if (!clientRef.current) return;
      clientRef.current.joinTournament(tournamentId, aliasInput);
      debugLog('action:join-tournament', { tournamentId, alias: aliasInput });
      enqueueSnackbar({ message: 'Join request sent', variant: 'info' });
    },
    [aliasInput, debugLog, enqueueSnackbar],
  );

  const handleLeaveTournamentClick = useCallback(() => {
    if (!clientRef.current || activeTournamentId === null) return;
    const tournamentId = activeTournamentId;
    clientRef.current.leaveTournament(String(tournamentId));
    membershipRef.current = { member: false, tournamentId: null };
    focusStateRef.current = null;
    setActiveTournamentId(null);
    resetActiveTournamentState();
    if (locationRef.current === `/ping-pong/tournaments/${tournamentId}`) {
      locationRef.current = '/ping-pong/tournaments';
      navigate('/ping-pong/tournaments');
    }
    void loadTournaments();
    debugLog('action:leave-tournament', { tournamentId });
  }, [activeTournamentId, debugLog, loadTournaments, navigate, resetActiveTournamentState]);

  const handleForfeitTournamentClick = useCallback(() => {
    if (!clientRef.current || activeTournamentId === null) return;
    clientRef.current.forfeitTournament(String(activeTournamentId));
    debugLog('action:forfeit-tournament', { tournamentId: activeTournamentId });
    enqueueSnackbar({ message: 'Forfeit request sent', variant: 'warning' });
  }, [activeTournamentId, debugLog, enqueueSnackbar]);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
      const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
      if (seedA !== seedB) return seedA - seedB;
      return a.alias.localeCompare(b.alias);
    });
  }, [participants]);

  const currentParticipantId = useMemo(() => {
    if (!user?.uuid) return null;
    const entry = participants.find((participant) => participant.userUuid === user.uuid);
    return entry?.participantId ?? null;
  }, [participants, user?.uuid]);

  const matchesByStage = useMemo(() => {
    return [...bracket].sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
      return a.roundPosition - b.roundPosition;
    });
  }, [bracket]);

  const pendingCountdown = pendingMatch ? matchCountdowns.get(pendingMatch.tournamentMatchId) : undefined;
  const countdownStatus = pendingCountdown?.status ?? null;
  const countdownSecondsDisplay =
    pendingCountdown?.status === 'running'
      ? localCountdownSeconds ?? pendingCountdown.secondsRemaining
      : pendingCountdown?.secondsRemaining ?? null;

  const seat = handoff?.side === 'east' ? 'P1' : 'P2';
  const isDetailView = activeTournamentId !== null;
  const headerRefreshHandler = isDetailView ? refreshTournamentState : loadTournaments;

  useEffect(() => {
    if (!pendingCountdown) {
      setLocalCountdownSeconds(null);
      return;
    }

    if (pendingCountdown.status !== 'running') {
      setLocalCountdownSeconds(pendingCountdown.secondsRemaining);
      return;
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((pendingCountdown.targetStartEpochMs - Date.now()) / 1000));
      setLocalCountdownSeconds(remaining);
    };

    update();
    const timer = window.setInterval(update, 300);
    return () => {
      window.clearInterval(timer);
    };
  }, [pendingCountdown]);

  useLayoutEffect(() => {
    if (matchPhase !== 'starting' && matchPhase !== 'playing') return;
    if (!canvasRef.current) return;
    requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
  }, [matchPhase]);

  useEffect(() => {
    if (matchPhase !== 'starting' || !handoff || !canvasRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const { bootstrapOnlinePong } = await import('../../../games/pong/host/online-embed');
        if (cancelled) return;
        const app = await bootstrapOnlinePong(canvasRef.current!, {
          serverUrl: handoff.gameServerWSUrl,
          matchId: handoff.matchId,
          roomIdentifier: handoff.roomIdentifier,
          seat,
          joinToken: handoff.joinToken,
          randomSeed: handoff.randomSeed,
        });
        if (cancelled) {
          app.destroy();
          return;
        }
        appRef.current = app;
        setMatchPhase('playing');
      } catch (error) {
        enqueueSnackbar({ message: 'Failed to start tournament match', variant: 'error' });
        setMatchPhase('idle');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enqueueSnackbar, handoff, seat, matchPhase]);

  useEffect(() => () => {
    appRef.current?.destroy();
    appRef.current = null;
  }, []);

  useEffect(() => () => {
    if (rejoinTimerRef.current) {
      window.clearTimeout(rejoinTimerRef.current);
      rejoinTimerRef.current = null;
    }
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (matchPhase === 'starting' || matchPhase === 'playing') {
      document.body.classList.add('pong-playing');
    } else {
      document.body.classList.remove('pong-playing');
    }
    return () => document.body.classList.remove('pong-playing');
  }, [matchPhase]);

  const handleQuitMatch = useCallback(() => {
    appRef.current?.destroy();
    appRef.current = null;
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

    if (clientRef.current && user?.username) {
      rejoinTimerRef.current = window.setTimeout(() => {
        const tournamentId = activeTournamentIdRef.current;
        if (!clientRef.current || !tournamentId) return;
        clientRef.current.joinTournament(tournamentId, user.username);
        enqueueSnackbar({ message: 'Rejoined tournament - waiting for next match', variant: 'info' });
      }, 3000);

      refreshTimerRef.current = window.setTimeout(() => {
        void refreshTournamentState();
      }, 3500);
    }
  }, [enqueueSnackbar, refreshTournamentState, user?.username]);

  useEffect(() => {
    if ((matchPhase !== 'starting' && matchPhase !== 'playing') || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let timer: number | null = null;
    const onMatchOver = () => {
      timer = window.setTimeout(() => {
        handleQuitMatch();
        enqueueSnackbar({ message: 'Match finished', variant: 'success' });
      }, 2500);
    };
    canvas.addEventListener('pong:matchOver', onMatchOver as EventListener);
    return () => {
      canvas.removeEventListener('pong:matchOver', onMatchOver as EventListener);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [matchPhase, handleQuitMatch, enqueueSnackbar]);

  return {
    user,
    userReady,
    navigate,
    connectionReady,
    loadingTournaments,
    availableTournaments,
    activeTournamentId,
    tournamentStatus,
    aliasInput,
    setAliasInput,
    tournamentName,
    setTournamentName,
    handleCreateTournamentClick,
    handleJoinTournamentClick,
    handleLeaveTournamentClick,
    handleForfeitTournamentClick,
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
