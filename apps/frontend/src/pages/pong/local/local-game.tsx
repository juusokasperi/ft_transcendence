// apps/frontend/src/pages/pong/local/local-game.tsx
import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameHistoryEntry } from '@pong/shared';
import type { BotDifficulty } from '../../../games/pong/ai/bot-controller';

import '@pong/render/ui/tailwind.css';
import '@pong/render/register';

import Navbar from '../../../components/Navbar';
import { useSnackbar } from '../../../context/SnackbarContext';
import gifImg from '../../../assets/gif.mp4';
import { BackgroundVideo } from '../shared/components/BackgroundVideo';
import { PlayingView, PostMatchView, SettingsView } from './components';
import { useLocalSettings } from './hooks/useLocalSettings';
import { usePongRuntime } from './hooks/usePongRuntime';
import { useAIBot } from './hooks/useAIBot';
import { useMatchOverEvent } from './hooks/useMatchOverEvent';
import { useKeyboardQuit } from './hooks/useKeyboardQuit';
import { useBodyClass } from './hooks/useBodyClass';

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
    // Make teardown immediate so we’re not stuck in the PlayingView branch.
    onAutoExit: () => setIsPlaying(false),
    autoExitDelayMs: 0,
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

  if (postMatch) {
    return (
      <div className="fixed inset-0 overflow-hidden text-white">
        <Navbar />

        <main
          aria-labelledby="postmatch-title"
          className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)]"
        >
          <BackgroundVideo src={gifImg} fit="contain" position="center" />

          <h1 id="postmatch-title" className="sr-only">
            Match Summary
          </h1>

          <section
            aria-labelledby="summary-heading"
            className="relative z-10 h-full w-full overflow-y-auto"
          >
            <div className="mx-auto w-full max-w-5xl p-6">
              <h2 id="summary-heading" className="sr-only">
                Match result
              </h2>

              <div className="mt-6 md:mt-10">
                <PostMatchView
                  summary={postMatch}
                  onPlayAgain={handlePlayAgain}
                  onReturnToMenu={handleReturnToMenu}
                />
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (isPlaying) {
    return <PlayingView canvasRef={canvasRef} onQuit={handleQuit} />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden text-white">
      <Navbar />

      <main
        aria-labelledby="settings-title"
        className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)]"
      >
        <BackgroundVideo src={gifImg} fit="contain" position="center" />

        <h1 id="settings-title" className="sr-only">
          Local Match Settings
        </h1>

        <section className="relative z-10 h-full w-full overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl p-6">
            <div className="mt-6 rounded-2xl md:mt-10">
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
        </section>
      </main>
    </div>
  );
};

export default LocalGame;
