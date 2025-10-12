import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameHistoryEntry } from '@pong/shared';
// Reuse in-game HUD styles and DOM builder
import '@pong/render/ui/tailwind.css';
import '@pong/render/register';
import { createScoreboard } from '@pong/render';
import type { BotDifficulty, Observation } from '../../../games/pong/ai/bot-controller';
import type { ControllerScheme, Preferences } from '../../../games/pong/modes/preferences';
import Navbar from '../../../components/Navbar';
import { Card, ColorPalette, DEFAULT_PONG_PALETTE, PlayButton } from '../../../components/pong-ui';
import {
  clearStoredSettings,
  getBestOf,
  readSettingsFromStorage,
  writeSettingsToStorage,
} from './utils';
import type { AccessibilitySettings, UserSettings } from './utils';
import gifImg from '../../../assets/gif.mp4';

const defaultSettings: UserSettings = {
  player1: { name: 'Player 1', paddleColor: '#00ff66', controller: 'wasd' }, // Green
  player2: { name: 'Player 2', paddleColor: '#bf5fff', controller: 'arrows' }, // Violet
  accessibility: { colorBlindMode: 'none', photoSensitiveMode: 'none' },
  rules: {
    game: {
      targetScore: 11,
      winBy: 2,
      servesPerTurn: 2,
      deuceServesPerTurn: 1,
      deuceAt: 10,
    },
    match: {
      bestOf: 3,
      switchEndsEachGame: true,
      decidingGameMidSwapAtPoints: 5,
      alternateInitialServerEachGame: true,
    },
  },
};

const STORAGE_KEY = 'pong_local_settings_v1';

const controllerOptions: { value: ControllerScheme; label: string }[] = [
  { value: 'wasd', label: 'W / S' },
  { value: 'arrows', label: 'Arrow Up / Arrow Down' },
];

const LocalGame: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isPlaying, setIsPlaying] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false); // Player 2 as AI
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const [isGameReady, setIsGameReady] = useState(false);
  const [postMatch, setPostMatch] = useState<{
    winner: 'east' | 'west';
    bestOf: number;
    gamesHistory: GameHistoryEntry[];
    names: { east: string; west: string };
  } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  const arrowSeatLabel = settings.player1.controller === 'arrows' ? 'Player 1' : 'Player 2';
  const arrowSeatName =
    settings.player1.controller === 'arrows'
      ? settings.player1.name.trim() || 'Player 1'
      : settings.player2.name.trim() || 'Player 2';

  // Scoreboard mount target for post-match HUD reuse
  const resultsHudRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!postMatch || isPlaying) return;
    if (!resultsHudRef.current) return;
    const hud = createScoreboard();
    hud.attachToElement(resultsHudRef.current);
    hud.setPlayerNames(postMatch.names.east, postMatch.names.west);
    hud.setGames(postMatch.gamesHistory, postMatch.bestOf);
    return () => hud.dispose();
  }, [postMatch, isPlaying]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<{
    destroy(): void;
    observe?: () => Observation;
    updatePreferences?: (p: Preferences) => void;
  } | null>(null);
  const botRef = useRef<{ stop(): void; setDifficulty: (d: BotDifficulty) => void } | null>(null);

  const restoreSettingsFromStorage = useCallback(() => {
    const restored = readSettingsFromStorage(localStorage, STORAGE_KEY, defaultSettings);
    setSettings(restored);
  }, [setSettings, defaultSettings]);

  const handleQuit = useCallback(() => {
    setIsPlaying(false);
    restoreSettingsFromStorage();
    navigate('/ping-pong');
  }, [navigate, restoreSettingsFromStorage]);

  // Load settings from localStorage (local-specific key)
  useEffect(() => {
    restoreSettingsFromStorage();
  }, [restoreSettingsFromStorage]);

  // Persist settings
  const saveSettings = () => {
    writeSettingsToStorage(localStorage, STORAGE_KEY, settings);
    alert('Settings saved!');
  };

  // Reset to defaults
  const resetSettings = () => {
    setSettings(defaultSettings);
    clearStoredSettings(localStorage, STORAGE_KEY);
  };

  // Boot game when we enter "playing" and a canvas is present; teardown on exit
  useEffect(() => {
    if (!isPlaying || !canvasRef.current) return;

    let cancelled = false;

    (async () => {
      // Lazy-load Babylon + host adapter only when starting the game
      //console.log('[LocalGame] Attempting to lazy-load Pong...');
      try {
        const { bootstrapPong } = await import('../../../games/pong/host/dom-embed');
        if (cancelled) {
          //console.log('[LocalGame] Cancelled before bootstrap.');
          return;
        }
        //console.log('[LocalGame] bootstrapPong loaded, booting...');
        const app = await bootstrapPong(canvasRef.current!, {
          player1: settings.player1,
          player2: settings.player2,
          // Pass match rules to local mode
          rules: settings.rules,
        });
        appRef.current = app;
        setIsGameReady(true);
      } catch (e) {
        console.error('[LocalGame] Failed to start Pong', e);
        setIsPlaying(false);
      }
    })();

    return () => {
      cancelled = true;
      if (botRef.current) {
        botRef.current.stop();
        botRef.current = null;
      }
      if (appRef.current) {
        //console.log('[LocalGame] Destroying Pong app...');
        appRef.current.destroy();
        appRef.current = null;
      }
      setIsGameReady(false);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      if (botRef.current) {
        botRef.current.stop();
        botRef.current = null;
      }
      return;
    }

    if (!aiEnabled) {
      if (botRef.current) {
        botRef.current.stop();
        botRef.current = null;
      }
      return;
    }

    if (botRef.current) {
      botRef.current.setDifficulty(botDifficulty);
      return;
    }

    if (!isGameReady) {
      return;
    }

    const canvas = canvasRef.current;
    const observer = (appRef.current as any)?.observe;
    if (!canvas || typeof observer !== 'function') {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { BotController } = await import('../../../games/pong/ai/bot-controller');
        if (cancelled || botRef.current) return;
        // AI always drives the Arrow controls; pick the matching seat so
        // the bot presses the right keys and plans for the right paddle
        // across side swaps.
        const botSeat: 'P1' | 'P2' = settings.player1.controller === 'arrows' ? 'P1' : 'P2';
        const bot = new BotController(canvas, botSeat, observer, botDifficulty);
        bot.start();
        botRef.current = bot;
      } catch (error) {
        console.error('[LocalGame] Failed to start AI bot', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPlaying, aiEnabled, botDifficulty, isGameReady]);

  useEffect(() => {
    if (!isPlaying) return;
    const app = appRef.current;
    if (!app?.updatePreferences) return;
    app.updatePreferences({
      player1: settings.player1,
      player2: settings.player2,
      rules: settings.rules,
    });
  }, [
    isPlaying,
    settings.player1.name,
    settings.player1.paddleColor,
    settings.player1.controller,
    settings.player2.name,
    settings.player2.paddleColor,
    settings.player2.controller,
  ]);

  // When the in-canvas game dispatches matchOver, capture summary and exit after 3 seconds
  useEffect(() => {
    if (!isPlaying || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let timer: number | null = null;
    const onMatchOver = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        winner: 'east' | 'west';
        bestOf: number;
        gamesHistory: GameHistoryEntry[];
        names: { east: string; west: string };
      };
      setPostMatch(detail);
      timer = window.setTimeout(() => {
        setIsPlaying(false);
      }, 3000);
    };
    canvas.addEventListener('pong:matchOver', onMatchOver as EventListener);
    return () => {
      canvas.removeEventListener('pong:matchOver', onMatchOver as EventListener);
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleQuit();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isPlaying, handleQuit]);

  // Ensure the canvas has keyboard focus whenever play begins
  useLayoutEffect(() => {
    if (!isPlaying || !canvasRef.current) return;
    // Focus on next paint to avoid any race with layout/reflow
    requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
  }, [isPlaying]);

  // Hide global navbar while playing (via body class)
  useEffect(() => {
    const cls = 'pong-playing';
    if (isPlaying) {
      document.body.classList.add(cls);
    } else {
      document.body.classList.remove(cls);
    }
    return () => document.body.classList.remove(cls);
  }, [isPlaying]);

  // Button handlers
  const handlePlay = () => {
    //console.log('[LocalGame] Play button clicked. Settings:', settings);
    setIsPlaying(true);
  };

  // Playing view: fullscreen canvas + Quit
  if (isPlaying) {
    return (
      <div className="relative h-screen w-full bg-black">
        <canvas ref={canvasRef} className="block h-full w-full" tabIndex={0} autoFocus />
        <button
          type="button"
          onClick={handleQuit}
          className="game-quit-button absolute right-5 top-5 cursor-pointer"
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

  // Settings view or post-match view
  if (!postMatch) {
    return (
      <div className="relative min-h-screen w-full overflow-auto">
        <Navbar />
        {/* Video Background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute left-0 top-0 z-0 h-full w-full object-cover"
        >
          <source src={gifImg} type="video/mp4" />
        </video>

        {/* Overlay Content */}
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center space-y-6 bg-black/60 pt-24 text-white">
          {/* Unified card container */}
          <Card
            title={<div className="text-center w-full">Local Game Settings</div>}
            accent="from-pink-500 via-purple-500 to-indigo-500"
            className="w-full max-w-4xl space-y-6 backdrop-blur"
          >

            {/* Player Settings Row */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Player 1 Settings */}
              <Card title="Player 1" className="flex flex-col items-center space-y-4 text-center">
                <label className="block w-full text-center text-sm font-semibold md:text-base">
                  Choose player name
                </label>
                <input
                  type="text"
                  value={settings.player1.name}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      player1: { ...settings.player1, name: e.target.value },
                    })
                  }
                  className="w-64 rounded border border-white/20 bg-black/40 px-3 py-2 text-base outline-none placeholder:text-white/40 focus:border-white/40"
                  placeholder="Player 1"
                />
                <label className="block w-full text-center text-sm font-semibold md:text-base">
                  Choose a paddle color
                </label>
                <ColorPalette
                  palette={DEFAULT_PONG_PALETTE}
                  selected={settings.player1.paddleColor}
                  onSelect={(c) =>
                    setSettings({
                      ...settings,
                      player1: { ...settings.player1, paddleColor: c.hex },
                    })
                  }
                />
                <label className="block w-full pt-2 text-center text-sm font-semibold md:text-base">
                  Choose controls
                </label>
                <select
                  value={settings.player1.controller}
                  onChange={(event) => {
                    const next = event.target.value as ControllerScheme;
                    setSettings((prev) => {
                      if (next === prev.player2.controller) {
                        return {
                          ...prev,
                          player1: { ...prev.player1, controller: next },
                          player2: { ...prev.player2, controller: prev.player1.controller },
                        };
                      }
                      return {
                        ...prev,
                        player1: { ...prev.player1, controller: next },
                      };
                    });
                  }}
                  className="w-64 rounded border border-white/20 bg-black/40 px-3 py-2 text-base outline-none focus:border-white/40"
                >
                  {controllerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Card>

              {/* Player 2 Settings */}
              <Card title="Player 2" className="flex flex-col items-center space-y-4 text-center">
                <label className="block w-full text-center text-sm font-semibold md:text-base">
                  Choose a player name
                </label>
                <input
                  type="text"
                  value={settings.player2.name}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      player2: { ...settings.player2, name: e.target.value },
                    })
                  }
                  className="w-64 rounded border border-white/20 bg-black/40 px-3 py-2 text-base outline-none placeholder:text-white/40 focus:border-white/40"
                  placeholder="Player 2"
                />
                <label className="block w-full text-center text-sm font-semibold md:text-base">
                  Choose a paddle color
                </label>
                <ColorPalette
                  palette={DEFAULT_PONG_PALETTE}
                  selected={settings.player2.paddleColor}
                  onSelect={(c) =>
                    setSettings({
                      ...settings,
                      player2: { ...settings.player2, paddleColor: c.hex },
                    })
                  }
                />
                <label className="block w-full pt-2 text-center text-sm font-semibold md:text-base">
                  Choose controls
                </label>
                <select
                  value={settings.player2.controller}
                  onChange={(event) => {
                    const next = event.target.value as ControllerScheme;
                    setSettings((prev) => {
                      if (next === prev.player1.controller) {
                        return {
                          ...prev,
                          player2: { ...prev.player2, controller: next },
                          player1: { ...prev.player1, controller: prev.player2.controller },
                        };
                      }
                      return {
                        ...prev,
                        player2: { ...prev.player2, controller: next },
                      };
                    });
                  }}
                  className="w-64 rounded border border-white/20 bg-black/40 px-3 py-2 text-base outline-none focus:border-white/40"
                >
                  {controllerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Card>
            </div>

            {/* AI Settings */}
            <div className="rounded-md border border-white/10 p-4 text-white/90">
              <div className="flex flex-col items-center space-y-4 text-center">
                <label className="flex w-full items-center justify-center gap-3 text-base">
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                  />
                  <h3 className="text-xl font-semibold">AI Opponent ({arrowSeatLabel})</h3>
                </label>

                <p className="text-sm text-white/60">
                  The AI always drives the Arrow Up / Arrow Down controls.
                </p>

                <div className="flex items-center justify-center gap-4">
                  <label
                    htmlFor="botDifficulty"
                    className="text-sm font-semibold text-white/100 md:text-base"
                  >
                    Difficulty
                  </label>

                  <select
                    id="botDifficulty"
                    value={botDifficulty}
                    onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
                    disabled={!aiEnabled}
                    className="w-48 rounded border border-white/20 bg-black/40 px-3 py-2 text-base outline-none transition focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Match Rules */}
            <div className="rounded-md border border-white/10 p-4">
              <button
                type="button"
                onClick={() => setRulesOpen((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between"
              >
                <span className="text-2xl font-semibold text-yellow-400">Match Rules</span>
                <span className="text-2xl leading-none text-yellow-400">
                  {rulesOpen ? '−' : '+'}
                </span>
              </button>

              {rulesOpen && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-white">
                    <label className="flex items-center justify-between">
                      <span>Best Of</span>
                      <select
                        value={settings.rules.match.bestOf}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            rules: {
                              ...settings.rules,
                              match: {
                                ...settings.rules.match,
                                bestOf: getBestOf(e.target.value, settings.rules.match.bestOf),
                              },
                            },
                          })
                        }
                        className="rounded bg-gray-800 p-2"
                      >
                        <option value={3}>3</option>
                        <option value={5}>5</option>
                        <option value={7}>7</option>
                      </select>
                    </label>

                    <label className="flex items-center justify-between">
                      <span>Target Score</span>
                      <input
                        type="number"
                        min={1}
                        value={settings.rules.game.targetScore}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            rules: {
                              ...settings.rules,
                              game: {
                                ...settings.rules.game,
                                targetScore: Math.max(1, Number(e.target.value)),
                              },
                            },
                          })
                        }
                        className="w-24 rounded bg-gray-800 p-2"
                      />
                    </label>

                    <label className="flex items-center justify-between">
                      <span>Win By</span>
                      <input
                        type="number"
                        min={1}
                        value={settings.rules.game.winBy}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            rules: {
                              ...settings.rules,
                              game: {
                                ...settings.rules.game,
                                winBy: Math.max(1, Number(e.target.value)),
                              },
                            },
                          })
                        }
                        className="w-24 rounded bg-gray-800 p-2"
                      />
                    </label>

                    <label className="flex items-center justify-between">
                      <span>Serves per Turn</span>
                      <input
                        type="number"
                        min={1}
                        value={settings.rules.game.servesPerTurn}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            rules: {
                              ...settings.rules,
                              game: {
                                ...settings.rules.game,
                                servesPerTurn: Math.max(1, Number(e.target.value)),
                              },
                            },
                          })
                        }
                        className="w-24 rounded bg-gray-800 p-2"
                      />
                    </label>

                    <label className="flex items-center justify-between">
                      <span>Deuce Serves per Turn</span>
                      <input
                        type="number"
                        min={1}
                        value={settings.rules.game.deuceServesPerTurn}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            rules: {
                              ...settings.rules,
                              game: {
                                ...settings.rules.game,
                                deuceServesPerTurn: Math.max(1, Number(e.target.value)),
                              },
                            },
                          })
                        }
                        className="w-24 rounded bg-gray-800 p-2"
                      />
                    </label>

                    <label className="flex items-center justify-between">
                      <span>Deciding Game Mid-Swap At</span>
                      <input
                        type="number"
                        min={1}
                        value={settings.rules.match.decidingGameMidSwapAtPoints ?? 5}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            rules: {
                              ...settings.rules,
                              match: {
                                ...settings.rules.match,
                                decidingGameMidSwapAtPoints: Number(e.target.value) || undefined,
                              },
                            },
                          })
                        }
                        className="w-24 rounded bg-gray-800 p-2"
                      />
                    </label>

                    <label className="flex items-center justify-between">
                      <span>Switch Ends Each Game</span>
                      <input
                        type="checkbox"
                        checked={settings.rules.match.switchEndsEachGame}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            rules: {
                              ...settings.rules,
                              match: {
                                ...settings.rules.match,
                                switchEndsEachGame: e.target.checked,
                              },
                            },
                          })
                        }
                        className="h-5 w-5"
                      />
                    </label>

                    <label className="flex items-center justify-between">
                      <span>Alternate Initial Server</span>
                      <input
                        type="checkbox"
                        checked={settings.rules.match.alternateInitialServerEachGame}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            rules: {
                              ...settings.rules,
                              match: {
                                ...settings.rules.match,
                                alternateInitialServerEachGame: e.target.checked,
                              },
                            },
                          })
                        }
                        className="h-5 w-5"
                      />
                    </label>
                  </div>
                  {/* Rules-only reset */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => setSettings({ ...settings, rules: defaultSettings.rules })}
                      className="rounded border border-yellow-400 px-4 py-2 text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                    >
                      Use defaults (rules)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={saveSettings}
                className="cursor-pointer rounded border border-green-400 px-6 py-2 text-green-400 transition hover:bg-green-400 hover:text-black"
              >
                Save as Default
              </button>
              <button
                onClick={resetSettings}
                className="cursor-pointer rounded border border-red-400 px-6 py-2 text-red-400 transition hover:bg-red-400 hover:text-black"
              >
                Reset to Default
              </button>
            </div>

            {/* Play button */}
            <div className="flex justify-center">
              <PlayButton onClick={handlePlay}>PLAY</PlayButton>
            </div>
          </Card>
          {/* end card */}
        </div>
      </div>
    );
  }

  // Post-match results view (reusing in-game HUD scoreboard)
  const westName = postMatch.names.west || 'Player 2';
  const eastName = postMatch.names.east || 'Player 1';
  // Determine winner based on last game history (player-pinned rows)
  const lastGame = postMatch.gamesHistory?.[postMatch.gamesHistory.length - 1];
  const winnerRow = (lastGame?.winner ?? postMatch.winner) as 'east' | 'west';
  const winnerName = winnerRow === 'east' ? eastName : westName;

  return (
    <div className="relative min-h-screen w-full overflow-auto">
      <Navbar />
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute left-0 top-20 z-0 h-full w-full object-cover"
      >
        <source src={gifImg} type="video/mp4" />
      </video>

      {/* Results Overlay */}
      <div className="flex min-h-screen items-center justify-center">
        <Card
          title={
            <span className="block w-full text-2xl font-semibold text-center">
              The winner of this match is <span className="font-bold text-emerald-400">{winnerName}</span>!
            </span>
          }
        >
          {/* Reused HUD scoreboard anchored to this container */}
          <div ref={resultsHudRef} className="w-full" style={{ height: 150 }} />

          {/* Buttons row centered */}
          <div className="flex w-full items-center justify-center gap-4">
            <PlayButton accent="cyan"
              onClick={() => {
                setPostMatch(null);
                setIsPlaying(true);
              }}
            >
              PLAY AGAIN
            </PlayButton>

            <PlayButton accent="crimson"
              onClick={() => navigate('/ping-pong')}
            >
              MENU
            </PlayButton>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LocalGame;
