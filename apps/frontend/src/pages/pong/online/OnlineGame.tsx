import React, { useCallback, useMemo, useReducer, useRef, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '../../../context/AppContext';
import Button from '../../../components/Button';
import { useSnackbar } from '../../../context/SnackbarContext';
import PlayingView from '../shared/components/PlayingView';
import { InlineSpinner } from '@ft/spinner';

import SurfaceCard from '../shared/components/SurfaceCard';
import StatusBadge from './components/StatusBadge';
import QueueControls from './components/QueueControls';
import MatchFoundPanel from './components/MatchFoundPanel';
import PostMatchOnlineView from './components/PostMatchOnlineView';
import { useBodyClass } from '../shared/hooks/useBodyClass';

import { useQueueTimer } from './hooks/useQueueTimer';
import { useGameBootstrap } from './hooks/useGameBootstrap';
import { useOnlineMatchEnd } from './hooks/useOnlineMatchEnd';
import { useBootstrapConfig } from './hooks/useBootstrapConfig';
import { useMatchmakingClient } from './hooks/useMatchmakingClient';
import { useMatchOverEvent } from '../shared/hooks/useMatchOverEvent';

import { initialState, reducer } from './state/machine';
import PageContainer from '../shared/components/PageContainer';
import PageSection from '../shared/components/PageSection';
import { useSetMatchActivity } from '../../../context/MatchActivityContext';

const OnlineGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const { axios, navigate, user, userReady } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const location = useLocation();

  const [connectKey, setConnectKey] = useState(0);
  const queueElapsed = useQueueTimer(state.status);
  const matchmakingEnabled =
    userReady && Boolean(user) && state.status !== 'starting' && state.status !== 'playing';

  const lastTimestamp = useRef(location.state?.timestamp);
  useEffect(() => {
    const newTimestamp = location.state?.timestamp;
    if (newTimestamp && newTimestamp !== lastTimestamp.current) {
      lastTimestamp.current = newTimestamp;
      if (state.status !== 'starting' && state.status !== 'playing') {
        setConnectKey((key) => key + 1);
      }
    }
  }, [location.state?.timestamp, state.status]);

  const liveMessage = useMemo(() => {
    switch (state.status) {
      case 'connecting':
        return 'Connecting to matchmaking.';
      case 'idle':
        return 'Idle. Not in queue.';
      case 'in_queue':
        return 'In queue. Looking for an opponent.';
      case 'match_found': {
        const name = state.opponent.username ?? 'opponent';
        return `Match found. Opponent ${name}. Accept or decline.`;
      }
      case 'match_accepted':
        return 'Match accepted. Waiting to start.';
      case 'starting':
        return 'Starting match.';
      case 'playing':
        return 'Match in progress.';
      case 'postmatch':
        return 'Match completed.';
      default:
        return '';
    }
  }, [state.status, state.opponent.username]);

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
        } catch (err) {
          console.error('[OnlineGame] Failed to refresh auth token', err);
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
    enabled: matchmakingEnabled,
    onAuthError: handleAuthError,
    onAllocatorError: handleAllocatorError,
    onMatchTimeout: handleMatchTimeout,
    onMatchDeclined: handleMatchDeclined,
  });

  const bootstrapConfig = useBootstrapConfig(state);
  const { handleMatchEnd } = useOnlineMatchEnd({
    seat: state.seat,
    dispatch,
    enqueueSnackbar,
    delayMs: 2500,
  });

  const matchActive = state.status === 'starting' || state.status === 'playing';
  const setMatchActive = useSetMatchActivity();

  useEffect(() => {
    //console.debug('[OnlineGame] matchActive changed', { matchActive });
    setMatchActive(matchActive);
    return () => setMatchActive(false);
  }, [matchActive, setMatchActive]);

  const handleMatchStarted = useCallback(() => {
    dispatch({ type: 'startPlaying' });
  }, [dispatch]);

  const { destroy: destroyGame } = useGameBootstrap({
    canvasRef,
    active: matchActive,
    config: bootstrapConfig,
    onStarted: handleMatchStarted,
    onEnded: handleMatchEnd,
  });

  const handleQuit = useCallback(() => {
    //console.debug('[OnlineGame] handleQuit invoked');
    destroyGame();
    dispatch({ type: 'reset' });
    reconnect();
    setMatchActive(false);
  }, [destroyGame, dispatch, reconnect, setMatchActive]);

  useBodyClass('pong-playing', matchActive);
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
    dispatch({ type: 'matchDeclined' });
    declineMatch(state.matchId);
  }, [declineMatch, dispatch, state.matchId]);

  if (userReady && !user) {
    return (
      <PageContainer>
        <PageSection>
          <div className="flex justify-center">
            <SurfaceCard className="w-full max-w-xl space-y-4 p-6 text-center shadow-2xl">
              <p className="text-base text-white">
                You need to be signed in before you can join online matchmaking.
              </p>
              <p className="text-sm text-white/60">
                Log in to enter the queue, challenge opponents, and track your results.
              </p>
              <Button variant="primary" onClick={() => navigate('/login')}>
                Go to login
              </Button>
            </SurfaceCard>
          </div>
        </PageSection>
      </PageContainer>
    );
  }

  if (state.status === 'starting' || state.status === 'playing') {
    return <PlayingView canvasRef={canvasRef} onQuit={handleQuit} />;
  }

  if (state.status === 'postmatch' && state.postMatchSummary) {
    return (
      <PageContainer>
        <PageSection>
          <PostMatchOnlineView
            summary={state.postMatchSummary}
            onBackToMenu={() => navigate('/pong')}
          />
        </PageSection>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageSection>
        <div className="flex justify-center">
          <SurfaceCard className="w-full max-w-xl space-y-4 p-4 shadow-2xl">
            <div className="sr-only" role="status" aria-live="polite">
              {liveMessage}
            </div>
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-wide">Matchmaking</h2>
                <p className="text-sm text-white/60">Queue up and play in real time.</p>
              </div>
              <StatusBadge status={state.status} />
            </header>

            {state.status === 'connecting' && (
              <div className="text-white/60">
                <InlineSpinner
                  size={18}
                  color="#A855F7"
                  label="Connecting to matchmaking"
                  className="text-white/60"
                  labelClassName="text-white/60"
                />
              </div>
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
      </PageSection>
    </PageContainer>
  );
};

export default OnlineGame;
