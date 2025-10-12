import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameHistoryEntry } from '@pong/shared';
import type { BotDifficulty } from '../../../games/pong/ai/bot-controller';

import '@pong/render/ui/tailwind.css';
import '@pong/render/register';

import Navbar from '../../../components/Navbar';
import { useSnackbar } from '../../../context/SnackbarContext';
import gifImg from '../../../assets/gif.mp4';
import { BackgroundVideo } from '../components/background-video';
import { PlayingView, PostMatchView, SettingsView } from './components';
import { useLocalSettings } from './hooks/use-local-settings';
import { usePongRuntime } from './hooks/use-pong-runtime';
import { useAIBot } from './hooks/use-AI-bot';
import { useMatchOverEvent } from './hooks/use-match-over-event';
import { useKeyboardQuit } from './hooks/use-keyboard-quit';
import { useBodyClass } from './hooks/use-body-class';

type MatchSummary = {
  winner: 'east' | 'west';
  bestOf: number;
  gamesHistory: GameHistoryEntry[];
  names: { east: string; west: string };
};

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

  useAIBot({
    enabled: aiEnabled,
    playing: isPlaying,
    difficulty: botDifficulty,
    canvasRef,
    runtimeRef,
    runtimeReady: ready,
    botSeat,
  });

  useMatchOverEvent({
    canvasRef,
    playing: isPlaying,
    onMatchOver: (detail) => setPostMatch(detail),
    onAutoExit: () => setIsPlaying(false),
  });

  const handleQuit = useCallback(() => {
    setIsPlaying(false);
    restore();
    navigate('/ping-pong');
  }, [navigate, restore]);

  useKeyboardQuit(isPlaying, handleQuit);
  useBodyClass('pong-playing', isPlaying);

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
    navigate('/ping-pong');
  }, [navigate]);

  if (isPlaying) {
    return <PlayingView canvasRef={canvasRef} onQuit={handleQuit} />;
  }

  if (postMatch) {
    return (
      <div className="relative min-h-screen text-white overflow-x-hidden">
        {/* Fixed site navigation */}
        <Navbar />

        {/* Content area scrolls; offset under fixed navbar */}
        <main
          aria-labelledby="postmatch-title"
          className="relative w-full min-h-[calc(100vh-var(--navbar-h,80px))] pt-[var(--navbar-h,80px)]"
        >
          {/* Decorative background (does not affect layout/scroll) */}
          <BackgroundVideo src={gifImg} fit="contain" position="center" />

          <h1 id="postmatch-title" className="sr-only">
            Match Summary
          </h1>

          {/* Foreground content; allow vertical scroll on small screens */}
          <div className="relative z-10 mx-auto w-full max-w-5xl p-6">
            <div className="rounded-2xl p-6">
              <PostMatchView
                summary={postMatch}
                onPlayAgain={handlePlayAgain}
                onReturnToMenu={handleReturnToMenu}
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
      {/* Fixed site navigation */}
      <Navbar />

      {/* Content area scrolls; offset under fixed navbar */}
      <main
        aria-labelledby="settings-title"
        className="relative w-full min-h-[calc(100vh-var(--navbar-h,80px))] pt-[var(--navbar-h,80px)]"
      >
        {/* Decorative background (does not affect layout/scroll) */}
        <BackgroundVideo src={gifImg} fit="contain" position="center" />

        <h1 id="settings-title" className="sr-only">
          Local Match Settings
        </h1>

        {/* Foreground content; allow vertical scroll on small screens */}
        <div className="relative z-10 mx-auto w-full max-w-4xl p-6">
          <div className="rounded-2xl p-6">
            <SettingsView
              settings={settings}
              onUpdateSettings={update}
              onSave={handleSave}
              onReset={handleReset}
              onResetRules={resetRules}
              onPlay={handlePlay}
              aiEnabled={aiEnabled}
              botDifficulty={botDifficulty}
              onToggleAI={(enabled) => setAiEnabled(enabled)}
              onDifficultyChange={(difficulty) => setBotDifficulty(difficulty)}
              arrowSeatLabel={arrowSeatLabel}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default LocalGame;
