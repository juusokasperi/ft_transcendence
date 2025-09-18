import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameHistoryEntry } from '@pong/shared';
import type { Ruleset } from '@pong/shared';
// Reuse in-game HUD styles and DOM builder
import '@pong/render/ui/tailwind.css';
import '@pong/render/register';
import { createScoreboard } from '@pong/render';

type AccessibilitySettings = {
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'highContrast';
  photoSensitiveMode: 'none' | 'reducedFX' | 'noFlash';
};

type PlayerSettings = {
  name: string;
  paddleColor: string;
};

type UserSettings = {
  player1: PlayerSettings;
  player2: PlayerSettings;
  accessibility: AccessibilitySettings;
  rules: Ruleset;
};

const defaultSettings: UserSettings = {
  player1: { name: 'Player 1', paddleColor: '#00ff66' }, // Green (from palette)
  player2: { name: 'Player 2', paddleColor: '#bf5fff' }, // Violet (from palette)
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

const LocalGame: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isPlaying, setIsPlaying] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false); // Player 2 as AI
  const [postMatch, setPostMatch] = useState<{
    winner: 'east' | 'west';
    bestOf: number;
    gamesHistory: GameHistoryEntry[];
    names: { east: string; west: string };
  } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

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
  const appRef = useRef<{ destroy(): void; observe?: () => any } | null>(null);
  const botRef = useRef<{ stop(): void } | null>(null);

  const STORAGE_KEY = 'pong_local_settings_v1';

  // Load settings from localStorage (local-specific key)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({
          player1: {
            name: parsed.player1?.name || defaultSettings.player1.name,
            paddleColor: parsed.player1?.paddleColor || defaultSettings.player1.paddleColor,
          },
          player2: {
            name: parsed.player2?.name || defaultSettings.player2.name,
            paddleColor: parsed.player2?.paddleColor || defaultSettings.player2.paddleColor,
          },
          accessibility: {
            colorBlindMode:
              parsed.accessibility?.colorBlindMode || defaultSettings.accessibility.colorBlindMode,
            photoSensitiveMode:
              parsed.accessibility?.photoSensitiveMode ||
              defaultSettings.accessibility.photoSensitiveMode,
          },
          rules: {
            game: {
              targetScore:
                parsed.rules?.game?.targetScore ?? defaultSettings.rules.game.targetScore,
              winBy: parsed.rules?.game?.winBy ?? defaultSettings.rules.game.winBy,
              servesPerTurn:
                parsed.rules?.game?.servesPerTurn ?? defaultSettings.rules.game.servesPerTurn,
              deuceServesPerTurn:
                parsed.rules?.game?.deuceServesPerTurn ??
                defaultSettings.rules.game.deuceServesPerTurn,
              deuceAt: parsed.rules?.game?.deuceAt ?? defaultSettings.rules.game.deuceAt,
            },
            match: {
              bestOf: parsed.rules?.match?.bestOf ?? defaultSettings.rules.match.bestOf,
              switchEndsEachGame:
                parsed.rules?.match?.switchEndsEachGame ??
                defaultSettings.rules.match.switchEndsEachGame,
              decidingGameMidSwapAtPoints:
                parsed.rules?.match?.decidingGameMidSwapAtPoints ??
                defaultSettings.rules.match.decidingGameMidSwapAtPoints,
              alternateInitialServerEachGame:
                parsed.rules?.match?.alternateInitialServerEachGame ??
                defaultSettings.rules.match.alternateInitialServerEachGame,
            },
          },
        });
      } catch {
        setSettings(defaultSettings);
      }
    }
  }, []);

  // Persist settings
  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    alert('Settings saved!');
  };

  // Reset to defaults
  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Boot game when we enter "playing" and a canvas is present; teardown on exit
  useEffect(() => {
    if (!isPlaying || !canvasRef.current) return;

    let cancelled = false;

    (async () => {
      // Lazy-load Babylon + host adapter only when starting the game
      //console.log('[LocalGame] Attempting to lazy-load Pong...');
      try {
        const { bootstrapPong } = await import('../../games/pong/host/dom-embed');
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

        // If AI is enabled, start bot controlling Player 2
        if (aiEnabled && canvasRef.current && (app as any).observe) {
          try {
            const { BotController } = await import('../../games/pong/ai/bot-controller');
            const bot = new BotController(canvasRef.current!, 'P2', (app as any).observe, 'normal');
            bot.start();
            botRef.current = bot;
          } catch (e) {
            console.error('[LocalGame] Failed to start AI bot', e);
          }
        }
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
    };
  }, [isPlaying]);

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
  const handleQuit = () => {
    //console.log('[LocalGame] Quit button clicked.');
    setIsPlaying(false);
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
        {/* Video Background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute left-0 top-0 z-0 h-full w-full object-cover"
        >
          <source src="/src/assets/gif.mp4" type="video/mp4" />
        </video>

        {/* Overlay Content */}
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center space-y-6 bg-black/60 pt-24 text-white">
          {/* Unified card container */}
          <div className="w-full max-w-4xl space-y-6 rounded-xl border border-white/20 bg-black/40 p-6 backdrop-blur">
            <h2 className="text-center text-3xl font-bold">Local Game Settings</h2>

            {/* Player Settings Row */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Player 1 Settings */}
              <div className="flex flex-col items-center space-y-4 rounded-md border border-white/10 p-4 text-center">
                <h3 className="text-xl font-semibold">Player 1</h3>
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
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    { name: 'Red', hex: '#ff3b3b' },
                    { name: 'Orange', hex: '#ff8c1a' },
                    { name: 'Yellow', hex: '#ffff33' },
                    { name: 'Green', hex: '#00ff66' },
                    { name: 'Blue', hex: '#3399ff' },
                    { name: 'Indigo', hex: '#7a5cff' },
                    { name: 'Violet', hex: '#bf5fff' },
                  ].map((c) => {
                    const selected =
                      settings.player1.paddleColor.toLowerCase() === c.hex.toLowerCase();
                    return (
                      <button
                        key={c.name}
                        type="button"
                        aria-label={c.name}
                        title={c.name}
                        onClick={() =>
                          setSettings({
                            ...settings,
                            player1: { ...settings.player1, paddleColor: c.hex },
                          })
                        }
                        className={
                          'h-8 w-8 cursor-pointer rounded-full border-2 transition ' +
                          (selected
                            ? 'scale-110 border-white'
                            : 'border-white/30 hover:border-white/60')
                        }
                        style={{ backgroundColor: c.hex }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Player 2 Settings */}
              <div className="flex flex-col items-center space-y-4 rounded-md border border-white/10 p-4 text-center">
                <h3 className="text-xl font-semibold">Player 2</h3>
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
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    { name: 'Red', hex: '#ff3b3b' },
                    { name: 'Orange', hex: '#ff8c1a' },
                    { name: 'Yellow', hex: '#ffff33' },
                    { name: 'Green', hex: '#00ff66' },
                    { name: 'Blue', hex: '#3399ff' },
                    { name: 'Indigo', hex: '#7a5cff' },
                    { name: 'Violet', hex: '#bf5fff' },
                  ].map((c) => {
                    const selected =
                      settings.player2.paddleColor.toLowerCase() === c.hex.toLowerCase();
                    return (
                      <button
                        key={c.name}
                        type="button"
                        aria-label={c.name}
                        title={c.name}
                        onClick={() =>
                          setSettings({
                            ...settings,
                            player2: { ...settings.player2, paddleColor: c.hex },
                          })
                        }
                        className={
                          'h-8 w-8 cursor-pointer rounded-full border-2 transition ' +
                          (selected
                            ? 'scale-110 border-white'
                            : 'border-white/30 hover:border-white/60')
                        }
                        style={{ backgroundColor: c.hex }}
                      />
                    );
                  })}
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
                                bestOf: Number(e.target.value) as Ruleset['match']['bestOf'],
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

            {/* Accessibility (Global) */}
            <div className="rounded-md border border-white/10 p-4">
              <button
                type="button"
                onClick={() => setAccessOpen((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between"
              >
                <span className="text-2xl font-semibold text-green-400">Accessibility</span>
                <span className="text-2xl leading-none text-green-400">
                  {accessOpen ? '−' : '+'}
                </span>
              </button>
              {accessOpen && (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-col space-y-2">
                    <label className="font-semibold">Color Blind Mode</label>
                    <select
                      value={settings.accessibility.colorBlindMode}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          accessibility: {
                            ...settings.accessibility,
                            colorBlindMode: e.target
                              .value as AccessibilitySettings['colorBlindMode'],
                          },
                        })
                      }
                      className="rounded bg-gray-800 p-2"
                    >
                      <option value="none">None</option>
                      <option value="protanopia">Protanopia</option>
                      <option value="deuteranopia">Deuteranopia</option>
                      <option value="tritanopia">Tritanopia</option>
                      <option value="highContrast">High Contrast</option>
                    </select>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <label className="font-semibold">Photosensitive Mode</label>
                    <select
                      value={settings.accessibility.photoSensitiveMode}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          accessibility: {
                            ...settings.accessibility,
                            photoSensitiveMode: e.target
                              .value as AccessibilitySettings['photoSensitiveMode'],
                          },
                        })
                      }
                      className="rounded bg-gray-800 p-2"
                    >
                      <option value="none">None</option>
                      <option value="reducedFX">Reduced FX</option>
                      <option value="noFlash">No Flash</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* AI Toggle */}
            <div className="flex justify-center pb-2">
              <label className="flex items-center gap-2 text-white/90">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                />
                <span>Play vs AI (Player 2)</span>
              </label>
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
              <button
                onClick={handlePlay}
                className="cursor-pointer rounded-lg border-2 border-pink-500 px-12 py-4 text-2xl font-bold text-pink-500 shadow-lg transition hover:bg-pink-500 hover:text-black"
              >
                Play 🚀
              </button>
            </div>
          </div>
          {/* end card */}
        </div>
      </div>
    );
  }

  // Post-match results view (reusing in-game HUD scoreboard)
  const eastName = postMatch.names.east || 'Player 1';
  const westName = postMatch.names.west || 'Player 2';
  const winnerName = postMatch.winner === 'east' ? eastName : westName;

  return (
    <div className="relative min-h-screen w-full overflow-auto">
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute left-0 top-0 z-0 h-full w-full object-cover"
      >
        <source src="/src/assets/gif.mp4" type="video/mp4" />
      </video>

      {/* Results Overlay */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center space-y-6 bg-black/70 p-6 pt-24 text-white">
        <h1 className="text-4xl font-bold">Match Results</h1>

        {/* Reused HUD scoreboard anchored to this container */}
        <div
          ref={resultsHudRef}
          className="w-full max-w-3xl rounded-xl border border-white/20 bg-transparent p-6"
          style={{ height: 150 }}
        />

        <div className="text-2xl">
          Winner: <span className="font-bold text-emerald-400">{winnerName}</span>
        </div>

        <div className="mt-2 flex gap-4">
          <button
            onClick={() => {
              setPostMatch(null);
              setIsPlaying(true);
            }}
            className="rounded-lg border-2 border-pink-500 px-8 py-3 text-lg font-semibold text-pink-500 transition hover:bg-pink-500 hover:text-black"
          >
            Play again
          </button>
          <button
            onClick={() => navigate('/ping-pong')}
            className="rounded-lg border-2 border-blue-500 px-8 py-3 text-lg font-semibold text-blue-500 transition hover:bg-blue-500 hover:text-black"
          >
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocalGame;
