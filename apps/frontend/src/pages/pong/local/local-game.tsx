import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameHistoryEntry } from '@pong/shared';
import type { BotDifficulty } from '../../../games/pong/ai/bot-controller';

import '@pong/render/ui/tailwind.css';
import '@pong/render/register';

import Navbar from '../../../components/Navbar';
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

  const [isPlaying, setIsPlaying] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const [postMatch, setPostMatch] = useState<MatchSummary | null>(null);

  const { settings, update, save, reset, resetRules, restore } = useLocalSettings();

  const handleBootstrapFailed = useCallback(() => {
    setIsPlaying(false);
  }, []);

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
    alert('Settings saved!');
  }, [save]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

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
      <div className="relative min-h-screen w-full overflow-auto">
        <Navbar />
        <BackgroundVideo src={gifImg} fit="contain" position="center" />
        <PostMatchView
          summary={postMatch}
          onPlayAgain={handlePlayAgain}
          onReturnToMenu={handleReturnToMenu}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-auto">
      <Navbar />
      <BackgroundVideo src={gifImg} fit="contain" position="center" />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center space-y-6 bg-black/60 pt-24 text-white">
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
  );
};

export default LocalGame;
