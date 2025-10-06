import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Navbar from '../../components/Navbar';
import Button from '../../components/Button';
import { createMatchmakingClient } from '../../services/matchmaking';
import type {
  HandoffTimeoutMessage,
  MatchmakingMessage,
  TournamentMatchState,
  TournamentParticipantState,
} from '@pong/shared/protocol/net';
import { useSnackbar } from '../../context/SnackbarContext';
import { useAppContext } from '../../context/AppContext';
import type { ActiveHandoff, CountdownSnapshot, ReadyMatch, TournamentSummary } from './components/types';
import { readyStageLabel } from './components/utils';
import TournamentParticipantsPanel from './components/TournamentParticipantsPanel';
import TournamentBracketPanel from './components/TournamentBracketPanel';

const TOURNAMENT_SIZE = 4;
const RECENT_TOURNAMENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_VISIBLE_TOURNAMENTS = 8;

const TournamentPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { user, userReady, axios, navigate } = useAppContext();

  const clientRef = useRef<ReturnType<typeof createMatchmakingClient> | null>(null);
  const activeTournamentIdRef = useRef<number | null>(null);
  const pendingMatchRef = useRef<ReadyMatch | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<{ destroy(): void } | null>(null);

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
  const [matchPhase, setMatchPhase] = useState<'idle' | 'awaiting_start' | 'starting' | 'playing'>(
    'idle',
  );
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
    activeTournamentIdRef.current = activeTournamentId;
  }, [activeTournamentId]);

  useEffect(() => {
    pendingMatchRef.current = pendingMatch;
  }, [pendingMatch]);

  const filterTournamentsForDisplay = useCallback(
    (incoming: TournamentSummary[]): TournamentSummary[] => {
      const parseTimestamp = (value?: string | null): number | null => {
        if (!value) return null;
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
      };

      const resolveTimestamp = (item: TournamentSummary): number | null => {
        const candidates: Array<string | null | undefined> = [
          item.updatedAt,
          item.startAt,
          item.createdAt,
        ];
        for (const candidate of candidates) {
          const parsed = parseTimestamp(candidate);
          if (parsed !== null) return parsed;
        }
        return null;
      };

      const byStatus = incoming.filter((tournament) =>
        ['draft', 'active'].includes(tournament.status),
      );

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
    },
    [],
  );

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
    loadTournaments();
  }, [loadTournaments, userReady, user]);

  const resetActiveTournamentState = useCallback(() => {
    setParticipants([]);
    setBracket([]);
    setPendingMatch(null);
    pendingMatchRef.current = null;
    setMatchCountdowns(new Map());
    setLatestReadyMatches([]);
    setTournamentStatus('draft');
    setMaxParticipants(null);
  }, []);

  const refreshTournamentState = useCallback(async () => {
    if (!activeTournamentId || !userReady) return;

    try {
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
          const players = (playersRes.data as Array<{ participantId: number; teamNumber: number }>).map(
            (player) => {
              const participant = participantMap.get(player.participantId);
              return {
                participantId: player.participantId,
                teamNumber: player.teamNumber,
                alias: participant?.alias ?? 'Unknown',
                status: participant?.status ?? 'pending',
              };
            },
          );

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
    } catch (error) {
      enqueueSnackbar({ message: 'Failed to refresh tournament state', variant: 'error' });
    }
  }, [activeTournamentId, axios, enqueueSnackbar, userReady]);

  useEffect(() => {
    if (!activeTournamentId) return;
    void refreshTournamentState();
  }, [activeTournamentId, refreshTournamentState]);

  const handleMessage = useCallback(
    (msg: MatchmakingMessage) => {
      switch (msg.type) {
        case 'CONNECTED':
          setConnectionReady(true);
          break;
        case 'ERROR':
          enqueueSnackbar({ message: msg.message ?? 'Tournament error', variant: 'error' });
          if (msg.code === 'AUTH') navigate('/login');
          if (msg.code === 'TOURNAMENT_API') {
            loadTournaments();
          }
          break;
        case 'TOURNAMENT_LOBBY_UPDATED': {
          setTournamentStatus(msg.status);
          setMaxParticipants(msg.maxParticipants ?? TOURNAMENT_SIZE);
          setParticipants(msg.participants);

          const userUuid = user?.uuid;
          const member = userUuid
            ? msg.participants.some((participant) => participant.userUuid === userUuid)
            : false;

          if (member) {
            setActiveTournamentId(msg.tournamentId);
          } else if (activeTournamentIdRef.current === msg.tournamentId) {
            setActiveTournamentId(null);
            resetActiveTournamentState();
          }

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
                maxParticipants:
                  msg.maxParticipants ?? existing.maxParticipants ?? TOURNAMENT_SIZE,
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
          setBracket(msg.matches);
          break;
        }
        case 'TOURNAMENT_MATCHES_READY': {
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
            } else {
              pendingMatchRef.current = null;
              setPendingMatch(null);
            }
          } else {
            pendingMatchRef.current = null;
            setPendingMatch(null);
          }
          break;
        }
        case 'TOURNAMENT_MATCH_COUNTDOWN': {
          const payload = msg;
          if (activeTournamentIdRef.current !== payload.tournamentId) break;

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
          break;
      }
    },
    [enqueueSnackbar, filterTournamentsForDisplay, loadTournaments, navigate, refreshTournamentState, resetActiveTournamentState, user?.uuid],
  );

  useEffect(() => {
    if (!userReady || !user) return;
    const client = createMatchmakingClient(handleMessage);
    clientRef.current = client;
    return () => {
      if (activeTournamentIdRef.current && clientRef.current) {
        clientRef.current.leaveTournament(String(activeTournamentIdRef.current));
      }
      client.close();
    };
  }, [handleMessage, userReady, user]);

  const handleCreateTournamentClick = () => {
    if (!clientRef.current) return;
    clientRef.current.createTournament(TOURNAMENT_SIZE, tournamentName);
    setTournamentName('');
    enqueueSnackbar({ message: 'Tournament creation requested…', variant: 'info' });
  };

  const handleJoinTournamentClick = (tournamentId: number) => {
    if (!clientRef.current) return;
    clientRef.current.joinTournament(tournamentId, aliasInput);
    enqueueSnackbar({ message: 'Join request sent', variant: 'info' });
  };

  const handleLeaveTournamentClick = () => {
    if (!clientRef.current || activeTournamentId === null) return;
    clientRef.current.leaveTournament(String(activeTournamentId));
    setActiveTournamentId(null);
    resetActiveTournamentState();
  };

  const handleForfeitTournamentClick = () => {
    if (!clientRef.current || activeTournamentId === null) return;
    clientRef.current.forfeitTournament(String(activeTournamentId));
    enqueueSnackbar({ message: 'Forfeit request sent', variant: 'warning' });
  };

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

  const pendingCountdown = pendingMatch
    ? matchCountdowns.get(pendingMatch.tournamentMatchId)
    : undefined;
  const countdownStatus = pendingCountdown?.status ?? null;
  const countdownSecondsDisplay =
    pendingCountdown?.status === 'running'
      ? localCountdownSeconds ?? pendingCountdown.secondsRemaining
      : pendingCountdown?.secondsRemaining ?? null;

  const seat = handoff?.side === 'east' ? 'P1' : 'P2';

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
      const remaining = Math.max(
        0,
        Math.ceil((pendingCountdown.targetStartEpochMs - Date.now()) / 1000),
      );
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
        const { bootstrapOnlinePong } = await import('../../games/pong/host/online-embed');
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

    // Auto-rejoin tournament after match completion to receive next match invitations.
    if (clientRef.current && user?.username) {
      rejoinTimerRef.current = window.setTimeout(() => {
        const tournamentId = activeTournamentIdRef.current;
        if (!clientRef.current || !tournamentId) return;
        clientRef.current.joinTournament(tournamentId, user.username);
        enqueueSnackbar({ message: 'Rejoined tournament - waiting for next match', variant: 'info' });
      }, 3000);

      // Refresh bracket state shortly after rejoining to pick up newly created matches.
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

  if (userReady && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
        <Navbar />
        <div className="mt-24 text-center">
          <p className="mb-4 text-xl">Log in to join tournaments.</p>
          <Button variant="primary" onClick={() => navigate('/login')}>
            Go to login
          </Button>
        </div>
      </div>
    );
  }

  if (matchPhase === 'starting' || matchPhase === 'playing') {
    return (
      <div className="relative min-h-screen w-full bg-black">
        <Navbar />
        <canvas ref={canvasRef} className="block h-full w-full" tabIndex={0} autoFocus />
        <button
          type="button"
          onClick={handleQuitMatch}
          className="game-quit-button absolute right-5 top-5"
          aria-label="Quit match"
        >
          Quit
          <span aria-hidden className="game-quit-hover-text">Quit</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <Navbar />
      <div className="mx-auto mt-24 flex w-full max-w-6xl flex-col gap-6 px-4 pb-16">
        <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Ping Pong Tournaments</h1>
            <p className="text-white/60">
              Create a lobby, invite players, and advance through the fixed four-slot bracket.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <span>
              Connection:
              <span className={`ml-2 font-semibold ${connectionReady ? 'text-emerald-400' : 'text-rose-400'}`}>
                {connectionReady ? 'Ready' : 'Connecting…'}
              </span>
            </span>
            <Button variant="secondary" size="sm" onClick={loadTournaments} disabled={loadingTournaments}>
              {loadingTournaments ? 'Refreshing…' : 'Refresh list'}
            </Button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
              <h2 className="mb-4 text-lg font-semibold">Create a new tournament</h2>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <input
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder="Tournament name"
                  className="w-full rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
                />
                <Button
                  variant="primary"
                  onClick={handleCreateTournamentClick}
                  disabled={!connectionReady}
                >
                  Create tournament
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
              <h2 className="mb-4 text-lg font-semibold">Open tournaments</h2>
              {availableTournaments.length === 0 ? (
                <p className="text-sm text-white/60">No tournaments available yet. Create one above!</p>
              ) : (
                <ul className="space-y-3">
                  {availableTournaments.map((tournament) => {
                    const isCurrent = tournament.id === activeTournamentId;
                    return (
                      <li
                        key={tournament.id}
                        className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/30 p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="text-base font-semibold">{tournament.name}</p>
                          <p className="text-xs uppercase tracking-widest text-white/50">
                            Status: {tournament.status}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isCurrent ? (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-200">
                              Joined
                            </span>
                          ) : tournament.status !== 'draft' ? (
                            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/60">
                              {tournament.status === 'active' ? 'In progress' : tournament.status}
                            </span>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleJoinTournamentClick(tournament.id)}
                              disabled={!connectionReady || activeTournamentId !== null || tournament.status !== 'draft'}
                            >
                              Join
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  placeholder="Preferred alias"
                  className="w-full rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none md:max-w-xs"
                />
                {activeTournamentId !== null && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleLeaveTournamentClick}>
                      Leave tournament
                    </Button>
                    {tournamentStatus === 'active' && (
                      <Button variant="dangerSecondary" size="sm" onClick={handleForfeitTournamentClick}>
                        Forfeit
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <TournamentParticipantsPanel
            participants={sortedParticipants}
            hasActiveTournament={activeTournamentId !== null}
            currentUserUuid={user?.uuid ?? null}
          />
        </section>

        <TournamentBracketPanel
          matches={matchesByStage}
          hasActiveTournament={activeTournamentId !== null}
          tournamentStatus={tournamentStatus}
          currentParticipantId={currentParticipantId}
        />

        {activeTournamentId !== null && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-semibold">Directed matches</h2>
              {pendingMatch && (
                <span className="text-xs uppercase tracking-[0.4em] text-white/60">
                  Next: {readyStageLabel(pendingMatch)}
                  {countdownStatus === 'running' && typeof countdownSecondsDisplay === 'number'
                    ? ` · Auto-start in ${Math.max(countdownSecondsDisplay, 0)}s`
                    : countdownStatus === 'started'
                    ? ' · Launching…'
                    : countdownStatus === 'cancelled'
                    ? ' · Waiting for players…'
                    : ' · Preparing…'}
                </span>
              )}
            </div>
            {latestReadyMatches.length === 0 ? (
              <p className="text-sm text-white/60">No scheduled matches yet.</p>
            ) : (
              <ul className="space-y-3">
                {latestReadyMatches.map((match) => {
                  const isYours = match.participants.some((participant) => participant.userUuid === user?.uuid);
                  const countdownInfo = matchCountdowns.get(match.tournamentMatchId);
                  const isPersonalMatch = pendingMatch?.tournamentMatchId === match.tournamentMatchId;
                  let countdownText: string | null = null;
                  let countdownTone = 'text-white/70';

                  if (countdownInfo) {
                    if (countdownInfo.status === 'running') {
                      const seconds = isPersonalMatch && typeof countdownSecondsDisplay === 'number'
                        ? Math.max(countdownSecondsDisplay, 0)
                        : Math.max(countdownInfo.secondsRemaining, 0);
                      countdownText = `Auto-starting in ${seconds}s`;
                      countdownTone = 'text-emerald-300';
                    } else if (countdownInfo.status === 'started') {
                      countdownText = 'Launching match…';
                      countdownTone = 'text-sky-300';
                    } else if (countdownInfo.status === 'cancelled') {
                      countdownText = 'Countdown paused — waiting for players';
                      countdownTone = 'text-amber-300';
                    }
                  }

                  if (!countdownText && isPersonalMatch) {
                    countdownText = 'As soon as both players are online, the countdown begins.';
                    countdownTone = 'text-white/70';
                  }
                  return (
                    <li
                      key={match.tournamentMatchId}
                      className={`rounded-xl border border-white/10 bg-black/40 p-4 text-sm ${
                        isYours ? 'border-indigo-400/40' : ''
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/40">
                        <span>Match #{match.tournamentMatchId}</span>
                        <span>{readyStageLabel(match)}</span>
                      </div>
                      <ul className="space-y-1">
                        {match.participants.map((participant) => (
                          <li
                            key={participant.participantId}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                              participant.userUuid === user?.uuid
                                ? 'bg-indigo-500/20 text-indigo-100'
                                : 'bg-white/5 text-white/80'
                            }`}
                          >
                            <span>
                              {participant.alias} · {participant.teamNumber === 1 ? 'West' : 'East'}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {countdownText && (
                        <div className={`mt-3 text-xs font-medium ${countdownTone}`}>
                          {countdownText}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default TournamentPage;
