import React, { useCallback, useMemo, useReducer, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../../components/Navbar';
import { useAppContext } from '../../../context/AppContext';
import { useSnackbar } from '../../../context/SnackbarContext';
import PlayingView from '../shared/components/PlayingView';
import gifImg from '../../../assets/gif.mp4';

import SurfaceCard from '../shared/components/SurfaceCard';
import StatusBadge from './components/StatusBadge';
import QueueControls from './components/QueueControls';
import MatchFoundPanel from './components/MatchFoundPanel';
import PostMatchOnlineView from './components/PostMatchOnlineView';
import { BackgroundVideo } from '../shared/components/BackgroundVideo';
import { useBodyClass } from '../shared/hooks/useBodyClass';

import { useQueueTimer } from './hooks/useQueueTimer';
import { useGameBootstrap } from './hooks/useGameBootstrap';
import { useMatchmakingClient } from './hooks/useMatchmakingClient';
import { useMatchOverEvent } from '../shared/hooks/useMatchOverEvent';
import { useCanvasAutofocus } from '../shared/hooks/useCanvasAutofocus';

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

  const { joinQueue, leaveQueue, acceptMatch, declineMatch, reconnect } = useMatchmakingClient({
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
  }, [
    state.serverUrl,
    state.matchId,
    state.roomIdentifier,
    state.joinToken,
    state.randomSeed,
    state.seat,
  ]);

  const postMatchTimerRef = useRef<number | null>(null);

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
      if (payload.reason === 'completed' && payload.summary) {
        if (postMatchTimerRef.current !== null) {
          window.clearTimeout(postMatchTimerRef.current);
        }
        postMatchTimerRef.current = window.setTimeout(() => {
          dispatch({ type: 'showPostMatch', summary: payload.summary! });
          postMatchTimerRef.current = null;
        }, 2500);
      } else {
        dispatch({ type: 'endMatch', payload });
      }
    },
    [enqueueSnackbar, state.seat],
  );

  // Clear any pending post-match transition timer on unmount
  useEffect(() => {
    return () => {
      if (postMatchTimerRef.current !== null) {
        window.clearTimeout(postMatchTimerRef.current);
        postMatchTimerRef.current = null;
      }
    };
  }, []);

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

  useBodyClass('pong-playing', matchActive);
  useCanvasAutofocus(matchActive, canvasRef);
  useMatchOverEvent({
    canvasRef,
    active: matchActive,
    onMatchOver: () => {},
    onAutoExit: handleQuit,
    autoExitDelayMs: 3000,
  });

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

  if (state.status === 'postmatch' && state.postMatchSummary) {
    return (
      <div className="fixed inset-0 overflow-hidden text-white">
        <Navbar />
        <main
          aria-labelledby="postmatch-title"
          className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)] overflow-y-auto"
        >
          <BackgroundVideo src={gifImg} fit="contain" position="center" />
          <h1 id="postmatch-title" className="sr-only">
            Match summary
          </h1>
          <PostMatchOnlineView
            summary={state.postMatchSummary}
            onBackToMenu={() => navigate('/ping-pong')}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden text-white">
      <Navbar />
      <main
        aria-labelledby="online-title"
        className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)] overflow-y-auto"
      >
        <BackgroundVideo src={gifImg} fit="contain" position="center" />
        <h1 id="online-title" className="sr-only">
          Online Pong Matchmaking
        </h1>
        <div className="relative z-10 mx-auto flex max-w-5xl justify-center px-4 py-20">
          <SurfaceCard className="w-full max-w-xl space-y-6 p-6 shadow-2xl">
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
          </SurfaceCard>
        </div>
      </main>
    </div>
  );
};

export default OnlineGame;
