import React, { useEffect, useRef, useState } from 'react';
import { createMatchmakingClient, type MatchmakingMessage } from '../../services/matchmaking';
import type { PlayerSeat } from '@pong/render';
import { useLayoutEffect } from 'react';

const OnlineGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<{ destroy(): void } | null>(null);
  const clientRef = useRef<ReturnType<typeof createMatchmakingClient> | null>(null);

  const [clientId, setClientId] = useState('');
  const [lobbyId, setLobbyId] = useState('');
  const [status, setStatus] = useState<'connecting' | 'idle' | 'lobby' | 'starting' | 'playing'>(
    'connecting',
  );

  const [serverUrl, setServerUrl] = useState('');
  const [matchId, setMatchId] = useState('');
  const [seat, setSeat] = useState<PlayerSeat>('P1');
  const [joinLobbyId, setJoinLobbyId] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = createMatchmakingClient((msg: MatchmakingMessage) => {
      switch (msg.type) {
        case 'connected':
          setClientId(msg.clientId);
          setStatus('idle');
          break;
        case 'lobbyCreated':
          setLobbyId(msg.lobbyId);
          setStatus('lobby');
          break;
        case 'matchFound':
          setServerUrl(msg.gameServerUrl);
          setMatchId(msg.matchId);
          setSeat(msg.seat);
          setStatus('starting');
          client.socket.close();
          break;
      }
    });
    clientRef.current = client;
    return () => client.socket.close();
  }, []);

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
    if (status === 'playing') return;
    if (status !== 'starting' || !canvasRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const { bootstrapOnlinePong } = await import('../../game/host/online-embed');
        if (cancelled) return;
        const app = await bootstrapOnlinePong(canvasRef.current!, {
          serverUrl,
          matchId,
          seat,
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
  }, [serverUrl, matchId, seat]);

  const handleCreateLobby = () => clientRef.current?.createLobby();
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

  // NEW: same playing container as LocalGame (for both 'starting' and 'playing')
  const handleQuit = () => {
    appRef.current?.destroy();
    appRef.current = null;
    setStatus('idle');
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
      <div className="relative h-screen w-full bg-black">
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
      <video
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-60"
      >
        <source src="/src/assets/gif.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 z-0 bg-black/60" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-6 p-4 text-white">
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

          <div className="space-y-2 text-sm text-white/80">
            <p>
              <span className="text-white/60">Client:</span>{' '}
              <span className="font-mono">{clientId || '...'}</span>
            </p>

            {lobbyId ? (
              <div className="mt-2 space-y-3">
                <p>
                  <span className="text-white/60">Lobby:</span>{' '}
                  <span className="font-mono">{lobbyId}</span>
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
                  Create Lobby
                </button>

                <div className="flex items-center gap-2">
                  <input
                    value={joinLobbyId}
                    onChange={(e) => setJoinLobbyId(e.target.value)}
                    placeholder="Lobby ID"
                    className="flex-1 rounded-lg border border-white/20 bg-black/40 px-3 py-2 font-mono outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <button
                    onClick={handleJoinLobby}
                    className="rounded-lg border-2 border-blue-400 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-400 hover:text-black"
                  >
                    Join
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnlineGame;
