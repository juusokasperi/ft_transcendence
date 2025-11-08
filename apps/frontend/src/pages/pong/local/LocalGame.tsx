// apps/frontend/src/pages/pong/local/LocalGame.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BotDifficulty } from '../../../games/pong/ai/bot-controller';

import '@pong/render/ui/tailwind.css';
import '@pong/render/register';

import { useSnackbar } from '../../../context/SnackbarContext';
import { PlayingView, PostMatchView, SettingsView } from './components';
import { useLocalSettings } from './hooks/useLocalSettings';
import { usePongRuntime } from './hooks/usePongRuntime';
import { useAIBot } from './hooks/useAIBot';
import { useKeyboardQuit } from './hooks/useKeyboardQuit';
import { useBodyClass } from '../shared/hooks/useBodyClass';
import { useLocalMatchEnd } from './hooks/useLocalMatchEnd';
import type { MatchSummary } from './types';
import PageContainer from '../shared/components/PageContainer';
import PageSection from '../shared/components/PageSection';
import { useSetMatchActivity } from '../../../context/MatchActivityContext';

const LocalGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  const [isPlaying, setIsPlaying] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const [postMatch, setPostMatch] = useState<MatchSummary | null>(null);

  const { settings, update, save, reset, resetRules, restore } = useLocalSettings();

  const handleBootstrapFailed = useCallback(() => {
    setIsPlaying(false);
    enqueueSnackbar({
      variant: 'error',
      message: 'Failed to start the game',
      description: 'Something went wrong while bootstrapping Pong.',
      duration: 5000,
    });
  }, [enqueueSnackbar]);

  const { runtimeRef, ready } = usePongRuntime({
    playing: isPlaying,
    canvasRef,
    settings,
    onBootstrapFailed: handleBootstrapFailed,
  });

  const botSeat: 'P1' | 'P2' = settings.player1.controller === 'arrows' ? 'P1' : 'P2';
  const arrowSeatLabel = settings.player1.controller === 'arrows' ? 'Player 1' : 'Player 2';
  const setMatchActive = useSetMatchActivity();

  useAIBot({
    enabled: aiEnabled,
    playing: isPlaying,
    difficulty: botDifficulty,
    canvasRef,
    runtimeRef,
    runtimeReady: ready,
    botSeat,
  });

  useLocalMatchEnd({
    canvasRef,
    playing: isPlaying,
    onSummary: (summary) => setPostMatch(summary),
    onAutoExit: () => setIsPlaying(false),
  });

  const handleQuit = useCallback(() => {
    setIsPlaying(false);
    restore();
    navigate('/pong');
  }, [navigate, restore]);

  useKeyboardQuit(isPlaying, handleQuit);
  useBodyClass('pong-playing', isPlaying);

  useEffect(() => {
    setMatchActive(isPlaying);
    return () => setMatchActive(false);
  }, [isPlaying, setMatchActive]);

  const handleSave = useCallback(() => {
    save();
    enqueueSnackbar({
      variant: 'success',
      message: 'Settings saved',
      description: 'Your preferences will be used next time.',
      duration: 3000,
    });
  }, [save, enqueueSnackbar]);

  const handleReset = useCallback(() => {
    reset();
    enqueueSnackbar({
      variant: 'info',
      message: 'Settings reset',
      description: 'Reverted to sensible defaults.',
    });
  }, [reset, enqueueSnackbar]);

  const handlePlay = useCallback(() => {
    setPostMatch(null);
    setIsPlaying(true);
  }, []);

  const handlePlayAgain = useCallback(() => {
    setPostMatch(null);
    setIsPlaying(true);
  }, []);

  const handleReturnToMenu = useCallback(() => {
    navigate('/pong');
  }, [navigate]);

  if (postMatch) {
    return (
      <PageContainer>
        <PageSection>
          <PostMatchView
            summary={postMatch}
            onPlayAgain={handlePlayAgain}
            onReturnToMenu={handleReturnToMenu}
          />
        </PageSection>
      </PageContainer>
    );
  }

  if (isPlaying) {
    return <PlayingView canvasRef={canvasRef} onQuit={handleQuit} />;
  }

  return (
    <PageContainer>
      <PageSection>
        <SettingsView
          settings={settings}
          onUpdateSettings={update}
          onSave={handleSave}
          onReset={handleReset}
          onResetRules={resetRules}
          onPlay={handlePlay}
          aiEnabled={aiEnabled}
          botDifficulty={botDifficulty}
          onToggleAI={setAiEnabled}
          onDifficultyChange={setBotDifficulty}
          arrowSeatLabel={arrowSeatLabel}
        />
      </PageSection>
    </PageContainer>
  );
};

export default LocalGame;
