import React, { useEffect, useRef, useState } from 'react';
import { createMatchmakingClient, type MatchmakingMessage } from '../../services/matchmaking';
import type { PlayerSeat } from '@pong/render';

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
    console.log('Ready clicked, lobbyId=', lobbyId);
    lobbyId && clientRef.current?.setReady(lobbyId, true);
  };
  const handleJoinLobby = () => {
    if (!joinLobbyId) return;
    clientRef.current?.acceptInvite(joinLobbyId);
    setLobbyId(joinLobbyId);
    setJoinLobbyId('');
  };

  return (
    <div className="mt-30 flex flex-col items-center space-y-4 p-4">
      {status !== 'playing' && (
        <div className="space-y-2 text-center">
          <p>Client: {clientId || '...'}</p>
          {lobbyId ? (
            <>
              <p>Lobby: {lobbyId}</p>
              <button onClick={handleReady} className="rounded border px-4 py-2">
                Click me if you are Ready
              </button>
            </>
          ) : (
            <>
              <button onClick={handleCreateLobby} className="rounded border px-4 py-2">
                Create Lobby
              </button>
              <div className="mt-2 space-x-2">
                <input
                  value={joinLobbyId}
                  onChange={(e) => setJoinLobbyId(e.target.value)}
                  placeholder="Lobby ID"
                  className="rounded border px-2 py-1"
                />
                <button onClick={handleJoinLobby} className="rounded border px-4 py-2">
                  Join Lobby
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <canvas ref={canvasRef} className="h-[600px] w-[800px]" />
    </div>
  );
};

export default OnlineGame;
