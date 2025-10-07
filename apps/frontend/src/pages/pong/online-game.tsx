import React, { useEffect, useRef, useState } from 'react';
import { createMatchmakingClient } from '../../services/matchmaking';
import type { MatchmakingMessage } from '@pong/shared/protocol/net';
import type { PlayerSeat } from '@pong/render';
import { useLayoutEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { Lobby } from '../../services/matchmaking';
import Navbar from '../../components/Navbar';
import { useSnackbar } from '../../context/SnackbarContext';
import Button from '../../components/Button';
import gifImg from '../../assets/gif.mp4';

interface LobbyListProps {
  lobbies: Lobby[];
  onJoin: (lobbyId: string) => void;
}

const LobbyList: React.FC<LobbyListProps> = ({ lobbies, onJoin }) => {
  if (lobbies.length === 0) return null;
  return (
    <div className="mb-4">
      <h2 className="mb-2 text-lg font-semibold">Open Lobbies</h2>
      <ul className="space-y-1">
        {lobbies.map((lobby) => (
          <li key={lobby.lobbyId} className="flex items-center gap-2">
            <span className="text-white/60">{lobby.hostName}'s lobby</span>
            {lobby.membersCount < lobby.capacity ? (
              <button
                onClick={() => onJoin(lobby.lobbyId)}
                className="ml-2 rounded border border-blue-400 px-2 py-1 text-xs text-blue-300 hover:bg-blue-400 hover:text-black"
              >
                Join
              </button>
            ) : (
              <button
                disabled
                className="ml-2 cursor-not-allowed rounded border border-red-500 bg-gray-800 px-2 py-1 text-xs text-gray-300 opacity-60"
              >
                Full
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const OnlineGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<{ destroy(): void } | null>(null);
  const clientRef = useRef<ReturnType<typeof createMatchmakingClient> | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { user, navigate, axios } = useAppContext();

  const [queueStart, setQueueStart] = useState<number | null>(null);
  const [queueElapsed, setQueueElapsed] = useState<number>(0);

  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [randomSeed, setRandomSeed] = useState<number | null>(null);
  const [roomIdentifier, setRoomIdentifier] = useState('');
  const [clientId, setClientId] = useState('');
  const [lobbyId, setLobbyId] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [shouldReconnect, setShouldReconnect] = useState(0);
  const [status, setStatus] = useState<
    | 'connecting'
    | 'in_queue'
    | 'idle'
    | 'match_found'
    | 'match_accepted'
    | 'lobby'
    | 'starting'
    | 'playing'
  >('connecting');

  const [opponentInfo, setOpponentInfo] = useState<{ username: string | null; mmr: number }>({
    username: null,
    mmr: 0,
  });
  const [serverUrl, setServerUrl] = useState('');
  const [matchId, setMatchId] = useState('');
  const [seat, setSeat] = useState<PlayerSeat>('P1');
  const [joinLobbyId, setJoinLobbyId] = useState('');
  const [ready, setReady] = useState(false);
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [aliasInput, setAliasInput] = useState('');

  useEffect(() => {
    if (status === 'in_queue') {
      setQueueStart(Date.now());
      setQueueElapsed(0);
    } else {
      setQueueStart(null);
      setQueueElapsed(0);
    }
  }, [status]);

  useEffect(() => {
    if (queueStart === null) return;
    const interval = setInterval(() => {
      setQueueElapsed(Math.floor((Date.now() - queueStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [queueStart]);

  useEffect(() => {
    const client = createMatchmakingClient((msg: MatchmakingMessage) => {
      switch (msg.type) {
        case 'CONNECTED':
          setClientId(msg.clientId);
          setAuthenticated(true);
          setStatus('idle');
          console.log('connected!');
          break;
        case 'QUEUE_JOINED':
          setStatus('in_queue');
          break;
        case 'QUEUE_LEFT':
          setStatus('idle');
          break;
        case 'MATCH_FOUND':
          setStatus('match_found');
          setMatchId(msg.matchId);
          setOpponentInfo({ username: msg.opponent.username, mmr: msg.opponent.mmr });
          break;
        case 'MATCH_DECLINED':
          setStatus('idle');
          setMatchId('');
          setRoomIdentifier('');
          setServerUrl('');
          setJoinToken(null);
          setRandomSeed(null);
          setOpponentInfo({ username: null, mmr: 0 });
          enqueueSnackbar({
            message: 'Your opponent declined or timed out',
            variant: 'error',
          });
          break;
        case 'HANDOFF':
          console.log(msg.gameServerWSUrl);
          setServerUrl(msg.gameServerWSUrl);
          setMatchId(msg.matchId);
          setRoomIdentifier(msg.roomIdentifier);
          setSeat(msg.side === 'east' ? 'P1' : 'P2');
          setRandomSeed(msg.randomSeed);
          setJoinToken(msg.joinToken);
          setStatus('starting');
          break;
        case 'MATCH_TIMEOUT':
          enqueueSnackbar({
            message: 'Pending match timed out.',
            variant: 'error',
          });
          setOpponentInfo({ username: null, mmr: 0 });
          setMatchId('');
          setStatus('idle');
          break;
        case 'ERROR':
          if (msg.code === 'AUTH') {
            setAuthenticated(false);
            if (msg.message === 'Token expired') {
              client.socket.close();
              (async () => {
                try {
                  await axios.post('/api/auth/refresh');
                  setStatus('connecting');
                  setShouldReconnect((prev) => (prev + 1) % 2);
                } catch {
                  enqueueSnackbar({
                    message: msg.message ? msg.message : 'Unknown authentication error',
                    variant: 'error',
                  });
                  navigate('/login');
                }
              })();
              break;
            }
            enqueueSnackbar({
              message: msg.message ? msg.message : 'Unknown authentication error',
              variant: 'error',
            });
            navigate('/login');
          }
          if (msg.code === 'ALLOCATOR') {
            setStatus('idle');
            setServerUrl('');
            setRoomIdentifier('');
            setJoinToken(null);
            setRandomSeed(null);
            enqueueSnackbar({
              message: msg.message ? msg.message : 'Unknown allocator error',
              variant: 'error',
            });
          }
          break;
        case 'TOURNAMENT_LOBBY_UPDATED':
        case 'TOURNAMENT_BRACKET_SNAPSHOT':
          // Tournament messages - handled in tournament pages, ignore here
          break;
        // case 'lobbyList':
        //   setLobbies(msg.lobbies);
        //   break;
        // case 'lobbyCreated':
        //   setLobbyId(msg.lobbyId);
        //   setStatus('lobby');
        //   break;
        // case 'lobbyAdded':
        //   setLobbies((prev: Lobby[]) => [...prev, msg.lobby]);
        //   break;
        // case 'lobbyUpdated':
        //   setLobbies((prev: Lobby[]) => {
        //     const idx = prev.findIndex((l) => l.lobbyId === msg.lobby.lobbyId);
        //     if (idx !== -1) {
        //       const updated = [...prev];
        //       updated[idx] = { ...updated[idx], ...msg.lobby };
        //       return updated;
        //     } else {
        //       return [...prev, msg.lobby];
        //     }
        //   });
        //   break;
        // case 'lobbyRemoved':
        //   removeLobby(msg.lobbyId);
        //   break;
        default:
          console.error('Unknown message type:', (msg as any).type);
      }
    });
    clientRef.current = client;
    return () => {
      client.socket.close();
    };
  }, [shouldReconnect]);

  // Auto-focus canvas when starting/playing
  useLayoutEffect(() => {
    if ((status !== 'starting' && status !== 'playing') || !canvasRef.current) return;
    requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
  }, [status]);

  // Hide global navbar while playing (via body class)
  useEffect(() => {
    const cls = 'pong-playing';
    if (status === 'playing' || status === 'starting') {
      document.body.classList.add(cls);
    } else {
      document.body.classList.remove(cls);
    }
    return () => document.body.classList.remove(cls);
  }, [status]);

  useEffect(() => {
    if (status !== 'starting' || !canvasRef.current || !joinToken || !serverUrl) return;
    if (randomSeed === null) return;

    let cancelled = false;
    (async () => {
      try {
        const { bootstrapOnlinePong } = await import('../../games/pong/host/online-embed');
        if (cancelled) return;
        const app = await bootstrapOnlinePong(canvasRef.current!, {
          serverUrl,
          matchId,
          roomIdentifier,
          seat,
          joinToken,
          randomSeed,
          onMatchEnd: (reason: string, winner?: 'east' | 'west') => {
            console.log('[OnlineGame] Match ended callback:', reason, winner);

            // Show notification about match result
            if (reason === 'opponent_timeout' && winner) {
              const youWon =
                (seat === 'P1' && winner === 'east') || (seat === 'P2' && winner === 'west');
              enqueueSnackbar({
                message: youWon
                  ? 'You won! Opponent disconnected.'
                  : 'Match ended. Opponent timed out.',
                variant: youWon ? 'success' : 'info',
              });
            }

            // Return to idle state after match ends
            setServerUrl('');
            setRoomIdentifier('');
            setJoinToken(null);
            setRandomSeed(null);
            setMatchId('');
            setOpponentInfo({ username: null, mmr: 0 });

            // Reconnect to matchmaking if connection was closed
            if (clientRef.current && clientRef.current.socket.readyState !== WebSocket.OPEN) {
              console.log('[OnlineGame] Matchmaking connection closed, reconnecting...');
              setStatus('connecting');
              setShouldReconnect((prev) => (prev + 1) % 2);
            } else {
              setStatus('idle');
            }
          },
        });
        appRef.current = app;
        setStatus('playing');
      } catch (e) {
        console.error('Failed to start online match', e);
      }
    })();

    return () => {
      cancelled = true;
      appRef.current?.destroy();
      appRef.current = null;
    };
  }, [serverUrl, matchId, seat, joinToken, roomIdentifier, randomSeed]);

  const removeLobby = (lobbyId: string) => {
    setLobbies((prev: Lobby[]) => prev.filter((l) => l.lobbyId !== lobbyId));
  };

  const getLobbyPlayerCount = (lobbyId: string) => {
    const lobby = lobbies.find((l) => l.lobbyId === lobbyId);
    return lobby ? `${lobby.membersCount}/${lobby.capacity}` : 'N/A';
  };

  const handleJoinQueue = () => {
    console.info('[Matchmaking] Join queue request');
    clientRef.current?.joinQueue(aliasInput.trim() || undefined);
  };

  const handleLeaveQueue = () => {
    console.info('[Matchmaking] Leave queue request');
    clientRef.current?.leaveQueue();
  };

  const handleAcceptMatch = (matchId: string) => {
    console.info('[Matchmaking] Accepting match', matchId);
    setStatus('match_accepted');
    clientRef.current?.acceptMatch(matchId);
  };

  const handleDeclineMatch = (matchId: string) => {
    setStatus('idle');
    clientRef.current?.declineMatch(matchId);
  };

  const handleCreateLobby = () => {
    if (user && user.username) clientRef.current?.createLobby(user.username);
  };
  const handleReady = () => {
    if (lobbyId) {
      clientRef.current?.setReady(lobbyId, true);
      setReady(true);
    }
  };
  const handleJoinLobby = () => {
    if (!joinLobbyId) return;
    clientRef.current?.acceptInvite(joinLobbyId);
    setLobbyId(joinLobbyId);
    setJoinLobbyId('');
  };

  const handleJoinLobbyDirect = (lobbyId: string) => {
    clientRef.current?.acceptInvite(lobbyId);
    setLobbyId(lobbyId);
    setJoinLobbyId('');
  };

  // NEW: same playing container as LocalGame (for both 'starting' and 'playing')
  const handleQuit = () => {
    appRef.current?.destroy();
    appRef.current = null;
    setLobbyId('');
    setReady(false);
    setServerUrl('');
    setMatchId('');
    setRoomIdentifier('');
    setJoinToken(null);
    setRandomSeed(null);
    setStatus('connecting');
    setShouldReconnect((prev) => (prev + 1) % 2);
  };

  // End-of-match handling: listen for in-canvas event and exit back to lobby
  useEffect(() => {
    if ((status !== 'starting' && status !== 'playing') || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let timer: number | null = null;
    const onMatchOver = () => {
      // Small delay to let the final FX/hud play out, then quit
      timer = window.setTimeout(() => {
        handleQuit();
      }, 3000);
    };
    canvas.addEventListener('pong:matchOver', onMatchOver as EventListener);
    return () => {
      canvas.removeEventListener('pong:matchOver', onMatchOver as EventListener);
      if (timer !== null) clearTimeout(timer);
    };
  }, [status]);

  if (status === 'starting' || status === 'playing') {
    return (
      <div className="relative min-h-screen w-full bg-black">
        <Navbar />
        <canvas ref={canvasRef} className="block h-full w-full" tabIndex={0} autoFocus />
        <button
          type="button"
          onClick={handleQuit}
          className="game-quit-button absolute right-5 top-5"
          aria-label="Quit game"
        >
          Quit
          <span aria-hidden className="game-quit-hover-text">
            Quit
          </span>
        </button>
      </div>
    );
  }

  // Lobby view (unchanged logic; just presentation)
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <Navbar />
      <div className="pt-24">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-60"
        >
          <source src={gifImg} type="video/mp4" />
        </video>
        <div className="absolute inset-0 z-0 bg-black/60" />
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-6rem)] max-w-7xl flex-col items-center justify-center gap-6 p-4 text-white">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-bold tracking-wide">Online Game</h1>
              <span
                className={`rounded-full px-3 py-1 text-sm ${
                  status === 'connecting'
                    ? 'bg-yellow-500/20 text-yellow-300'
                    : status === 'lobby'
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {status}
              </span>
            </div>

            {status === 'idle' && (
              <div className="flex flex-col gap-3">
                <input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  placeholder="Your alias (optional)"
                  className="w-full rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
                />
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  onClick={handleJoinQueue}
                  className="gap-3"
                >
                  Find a Match
                </Button>
              </div>
            )}

            {status === 'in_queue' && (
              <div>
                <p className="text-white/60">
                  Looking for an opponent..
                  <span className="ml-2 font-mono">({queueElapsed}s)</span>
                </p>

                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={handleLeaveQueue}
                  className="gap-3"
                >
                  Leave Queue
                </Button>
              </div>
            )}

            {status === 'match_found' && (
              <div className="mt-2 space-y-3">
                <p>Match Found!</p>
                <p>
                  Opponent: {opponentInfo.username} (Rating: {opponentInfo.mmr})
                </p>

                <Button
                  type="button"
                  variant="success"
                  fullWidth
                  onClick={() => handleAcceptMatch(matchId)}
                  className="gap-3"
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  fullWidth
                  onClick={() => handleDeclineMatch(matchId)}
                  className="gap-3"
                >
                  Decline
                </Button>
              </div>
            )}

            {status === 'match_accepted' && (
              <div className="mt-2 space-y-3">Waiting for the other player to respond.</div>
            )}

            {/* {lobbyId ? (
              <div className="mt-2 space-y-3">
                <p>
                  <span className="text-white/60">Lobby:</span>{' '}
                  <span className="font-mono">{lobbyId}</span>
                </p>
                <p>
                  <span className="text-white/60">Players: </span>
                  <span className="font-mono">{getLobbyPlayerCount(lobbyId)}</span>
                </p>
                <button
                  onClick={handleReady}
                  disabled={ready}
                  className={
                    ready
                      ? 'w-full cursor-default rounded-lg border-2 border-green-400 bg-green-900/80 px-4 py-2 font-semibold text-green-300'
                      : 'w-full rounded-lg border-2 border-emerald-400 px-4 py-2 font-semibold text-emerald-300 transition hover:bg-emerald-400 hover:text-black'
                  }
                >
                  {ready ? 'Ready! ✅' : 'I’m Ready ✅'}
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <button
                  onClick={handleCreateLobby}
                  className="w-full rounded-lg border-2 border-pink-500 px-4 py-2 font-semibold text-pink-400 transition hover:bg-pink-500 hover:text-black"
                >
                  Create Tournament
                </button>
              </div>
            )} */}
            {lobbies.length > 0 && (
              <div>
                <p>
                  <span className="text-white/60">Open Tournament Lobbies:</span>
                </p>
                <LobbyList
                  lobbies={lobbies}
                  onJoin={(lobbyId) => {
                    handleJoinLobbyDirect(lobbyId);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnlineGame;
