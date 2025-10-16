import React, { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import Navbar from '../../../components/Navbar';
import { useAppContext } from '../../../context/AppContext';
import { useSnackbar } from '../../../context/SnackbarContext';
import PlayingView from '../components/playing-view';
import gifImg from '../../../assets/gif.mp4';

import Panel from './components/panel';
import StatusBadge from './components/status-badge';
import QueueControls from './components/queue-controls';
import MatchFoundPanel from './components/match-found-panel';
import { BackgroundVideo } from '../components/background-video';

import { useQueueTimer } from './hooks/use-queue-timer';
import { useGameBootstrap } from './hooks/use-game-bootstrap';
import { useNavbarPlayingClass } from './hooks/use-navbar-playing-class';
import { useAutoFocusCanvas } from './hooks/use-auto-focus-canvas';
import { useMatchOverListener } from './hooks/use-match-over-listener';
import { useMatchmakingClient } from './hooks/use-matchmaking-client';

import { initialState, reducer } from './state/machine';
import type { MatchEndPayload } from './state/types';

const OnlineGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const { axios, navigate } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();

  const [connectKey, setConnectKey] = useState(0);
  const queueElapsed = useQueueTimer(state.status);

  const handleMatchDeclined = useCallback(() => {
    enqueueSnackbar({ message: 'Match declined or unavailable.', variant: 'error' });
  }, [enqueueSnackbar]);

  const handleMatchTimeout = useCallback(() => {
    enqueueSnackbar({ message: 'Pending match timed out.', variant: 'error' });
  }, [enqueueSnackbar]);

  const handleAllocatorError = useCallback(
    (message?: string) => {
      enqueueSnackbar({
        message: message ?? 'No available game servers right now. Please try again shortly.',
        variant: 'error',
      });
    },
    [enqueueSnackbar],
  );

  const handleAuthError = useCallback(
    async (message?: string) => {
      const fallbackMessage = message ?? 'Authentication error. Please sign in again.';
      if (message === 'Token expired') {
        try {
          await axios.post('/api/auth/refresh');
          setConnectKey((key) => key + 1);
          return;
        } catch (error) {
          console.error('[OnlineGame] Failed to refresh auth token', error);
        }
      }

      enqueueSnackbar({ message: fallbackMessage, variant: 'error' });
      navigate('/login');
    },
    [axios, enqueueSnackbar, navigate],
  );

  const {
    joinQueue,
    leaveQueue,
    acceptMatch,
    declineMatch,
    reconnect,
  } = useMatchmakingClient({
    dispatch,
    connectKey,
    requestReconnect: () => setConnectKey((key) => key + 1),
    onAuthError: handleAuthError,
    onAllocatorError: handleAllocatorError,
    onMatchTimeout: handleMatchTimeout,
    onMatchDeclined: handleMatchDeclined,
  });

  const bootstrapConfig = useMemo(() => {
    if (
      !state.serverUrl ||
      !state.matchId ||
      !state.roomIdentifier ||
      !state.joinToken ||
      state.randomSeed === null
    ) {
      return null;
    }
    return {
      serverUrl: state.serverUrl,
      matchId: state.matchId,
      roomIdentifier: state.roomIdentifier,
      joinToken: state.joinToken,
      randomSeed: state.randomSeed,
      seat: state.seat,
    };
  }, [state.serverUrl, state.matchId, state.roomIdentifier, state.joinToken, state.randomSeed, state.seat]);

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
          (state.seat === 'P1' && payload.winner === 'east') ||
          (state.seat === 'P2' && payload.winner === 'west');
        enqueueSnackbar({
          message: youWon
            ? 'You won! Opponent disconnected.'
            : 'Match ended. Opponent disconnected.',
          variant: youWon ? 'success' : 'info',
        });
      }
      dispatch({ type: 'endMatch', payload });
    },
    [enqueueSnackbar, state.seat],
  );

  const matchActive = state.status === 'starting' || state.status === 'playing';

  const { destroy: destroyGame } = useGameBootstrap({
    canvasRef,
    active: matchActive,
    config: bootstrapConfig,
    onStarted: () => dispatch({ type: 'startPlaying' }),
    onEnded: handleMatchEnd,
  });

  const handleQuit = useCallback(() => {
    destroyGame();
    dispatch({ type: 'reset' });
    reconnect();
  }, [destroyGame, reconnect]);

  useNavbarPlayingClass(state.status);
  useAutoFocusCanvas(state.status, canvasRef);
  useMatchOverListener({ status: state.status, canvasRef, onMatchOver: handleQuit });

  const handleJoinQueue = useCallback(
    (alias?: string) => {
      joinQueue(alias);
    },
    [joinQueue],
  );

  const handleLeaveQueue = useCallback(() => {
    leaveQueue();
  }, [leaveQueue]);

  const handleAcceptMatch = useCallback(() => {
    if (!state.matchId) return;
    dispatch({ type: 'matchAccepted' });
    acceptMatch(state.matchId);
  }, [acceptMatch, state.matchId]);

  const handleDeclineMatch = useCallback(() => {
    if (!state.matchId) return;
    declineMatch(state.matchId);
  }, [declineMatch, state.matchId]);

  if (state.status === 'starting' || state.status === 'playing') {
    return <PlayingView canvasRef={canvasRef} onQuit={handleQuit} />;
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <Navbar />
      <BackgroundVideo src={gifImg} fit="contain" position="center" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl items-center justify-center px-4 py-20">
        <Panel className="w-full max-w-xl space-y-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-wide">Online Game</h1>
              <p className="text-sm text-white/60">Queue up and play in real time.</p>
            </div>
            <StatusBadge status={state.status} />
          </header>

          {state.status === 'connecting' && (
            <p className="text-white/60">Connecting to matchmaking…</p>
          )}

          {(state.status === 'idle' || state.status === 'in_queue') && (
            <QueueControls
              status={state.status}
              queueElapsed={queueElapsed}
              onJoin={handleJoinQueue}
              onLeave={handleLeaveQueue}
            />
          )}

          {state.status === 'match_found' || state.status === 'match_accepted' ? (
            <MatchFoundPanel
              opponent={state.opponent}
              status={state.status}
              onAccept={handleAcceptMatch}
              onDecline={handleDeclineMatch}
            />
          ) : null}

        </Panel>
      </div>
    </div>
  );
};

export default OnlineGame;
