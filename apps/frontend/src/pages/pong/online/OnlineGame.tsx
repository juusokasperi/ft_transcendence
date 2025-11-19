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
import ConfirmDialog from '../../../components/ConfirmDialog';
import PostMatchOnlineView from './components/PostMatchOnlineView';
import { useBodyClass } from '../shared/hooks/useBodyClass';

import { useQueueTimer } from './hooks/useQueueTimer';
import { useGameBootstrap } from './hooks/useGameBootstrap';
import { useOnlineMatchEnd } from './hooks/useOnlineMatchEnd';
import { useBootstrapConfig } from './hooks/useBootstrapConfig';
import { useMatchmakingClient } from './hooks/useMatchmakingClient';
import { findAnyStoredResumeCandidate } from '../../../games/pong/modes/online/resume';
import { useMatchOverEvent } from '../shared/hooks/useMatchOverEvent';

import { initialState, reducer } from './state/machine';
import PageContainer from '../shared/components/PageContainer';
import PageSection from '../shared/components/PageSection';
import { useSetMatchActivity } from '../../../context/MatchActivityContext';

const OnlineGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const { axios, navigate, user, setUser, userReady } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const location = useLocation();

  const [confirmation, setConfirmation] = useState<{ message: string } | null>(null);
  const [connectKey, setConnectKey] = useState(0);
  const queueElapsed = useQueueTimer(state.status);
  const matchmakingEnabled =
    userReady &&
    Boolean(user) &&
    state.status !== 'starting' &&
    state.status !== 'playing' &&
    state.status !== 'postmatch';

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

  const handleRatelimit = useCallback(
    (message?: string) => {
      enqueueSnackbar({
        message: message ?? 'You are sending messages too fast. Please try again shortly.',
        variant: 'error',
      });
    },
    [enqueueSnackbar],
  );

  const handleConfirmation = useCallback((message?: string) => {
    setConfirmation({ message: message ?? 'Confirmation required' });
  }, []);

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
      setUser(null);
    },
    [axios, enqueueSnackbar, navigate],
  );

  const { joinQueue, leaveQueue, acceptMatch, declineMatch, reconnect, confirmJoin } =
    useMatchmakingClient({
      dispatch,
      connectKey,
      requestReconnect: () => setConnectKey((key) => key + 1),
      enabled: matchmakingEnabled,
      onAuthError: handleAuthError,
      onAllocatorError: handleAllocatorError,
      onRatelimit: handleRatelimit,
      onConfirmation: handleConfirmation,
      onMatchTimeout: handleMatchTimeout,
      onMatchDeclined: handleMatchDeclined,
    });

  const bootstrapConfig = useBootstrapConfig(state);

  const onBootstrapFailed = useCallback(() => {
    // Ensure users land on the online lobby when resume expires or fails
    try {
      navigate('/pong/online');
    } catch {}
  }, [navigate]);

  const { handleMatchEnd } = useOnlineMatchEnd(
    {
      seat: state.seat,
      dispatch,
      enqueueSnackbar,
      delayMs: 2500,
    },
    onBootstrapFailed,
  );

  const matchActive =
    state.status === 'starting' || state.status === 'playing' || state.status === 'postmatch';
  const setMatchActive = useSetMatchActivity();

  useEffect(() => {
    //console.debug('[OnlineGame] matchActive changed', { matchActive });
    setMatchActive(matchActive);
    return () => setMatchActive(false);
  }, [matchActive, setMatchActive]);

  const handleMatchStarted = useCallback(() => {
    dispatch({ type: 'startPlaying' });
  }, [dispatch]);

  const { giveUp } = useGameBootstrap({
    canvasRef,
    active: matchActive,
    config: bootstrapConfig,
    onStarted: handleMatchStarted,
    onEnded: handleMatchEnd,
  });

  // Controls whether we auto-resume from stored tokens after leaving a match.
  const skipAutoResumeRef = useRef(false);

  const handleQuit = useCallback(() => {
    // Send forfeit; server will broadcast MATCH_END with a summary.
    giveUp();
    // Prevent auto-resume for this navigation context.
    skipAutoResumeRef.current = true;
    setMatchActive(false);
    // Keep view until server response so we can show PostMatch with results.
  }, [giveUp, setMatchActive]);

  useBodyClass('pong-playing', matchActive);
  useMatchOverEvent({
    canvasRef,
    active: matchActive,
    onMatchOver: () => {},
    // For online, wait for server MATCH_END (with summary) instead of auto-exit.
    onAutoExit: undefined,
    autoExitDelayMs: 3000,
  });

  const handleJoinQueue = useCallback(() => {
    joinQueue();
  }, [joinQueue]);

  const handleLeaveQueue = useCallback(() => {
    leaveQueue();
  }, [leaveQueue]);

  const handleAcceptMatch = useCallback(() => {
    if (!state.matchId) return;
    dispatch({ type: 'matchAccepted' });
    acceptMatch(state.matchId);
  }, [acceptMatch, state.matchId]);

  // If we land on the online page with a valid resume token stored, proactively
  // bootstrap the PLAYING view so the in-game resume overlay can appear.
  useEffect(() => {
    if (!userReady || !user) return;
    // Only consider auto-resume from stored tokens when truly idle in the online lobby.
    if (state.status !== 'idle') return;
    if (skipAutoResumeRef.current) return;
    const candidate = findAnyStoredResumeCandidate();
    if (!candidate) return;
    dispatch({
      type: 'handoff',
      payload: {
        serverUrl: `/g/${candidate.roomIdentifier}`,
        matchId: 'resume',
        roomIdentifier: candidate.roomIdentifier,
        side: 'east', // placeholder; corrected after resume by server state
        randomSeed: 0,
        joinToken: '',
      },
    });
  }, [state.status, userReady, user, dispatch]);

  const handleDeclineMatch = useCallback(() => {
    if (!state.matchId) return;
    dispatch({ type: 'matchDeclined' });
    declineMatch(state.matchId);
  }, [declineMatch, dispatch, state.matchId]);

  const handleConfirmJoin = useCallback(() => {
    confirmJoin();
    setConfirmation(null);
  }, [confirmJoin]);

  const handleCancelJoin = useCallback(() => {
    setConfirmation(null);
  }, []);

  if (userReady && !user) {
    return (
      <PageContainer>
        <PageSection>
          <div className="flex justify-center">
            <SurfaceCard className="w-full max-w-xl space-y-4 p-6 text-center shadow-2xl">
              <p className="text-base text-white">
                You need to be signed in and logged in before you can join online matches.
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
        <PageSection className="flex min-h-[60vh] items-center justify-center">
          <div className="w-full max-w-2xl">
            <PostMatchOnlineView
              summary={state.postMatchSummary}
              onBackToMenu={() => navigate('/pong')}
            />
          </div>
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

            <ConfirmDialog
              open={Boolean(confirmation)}
              title="Join matchmaking queue?"
              description={confirmation?.message ?? ''}
              onConfirm={handleConfirmJoin}
              onCancel={handleCancelJoin}
            />
          </SurfaceCard>
        </div>
      </PageSection>
    </PageContainer>
  );
};

export default OnlineGame;
