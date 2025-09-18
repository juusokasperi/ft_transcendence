import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameHistoryEntry } from '@pong/shared';
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
};

const defaultSettings: UserSettings = {
  player1: { name: 'Player 1', paddleColor: '#795fecff' },
  player2: { name: 'Player 2', paddleColor: '#ff0000' },
  accessibility: { colorBlindMode: 'none', photoSensitiveMode: 'none' },
};

const LocalGame: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isPlaying, setIsPlaying] = useState(false);
  const [postMatch, setPostMatch] = useState<
    | {
        winner: 'east' | 'west';
        bestOf: number;
        gamesHistory: GameHistoryEntry[];
        names: { east: string; west: string };
      }
    | null
  >(null);

  // Scoreboard mount target for post-match HUD reuse
  const resultsHudRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!postMatch || isPlaying) return;
    if (!resultsHudRef.current) return;
    const hud = createScoreboard();
    // attach overlay to our container (div works; scoreboard only reads rects/RO)
    hud.attachToCanvas(resultsHudRef.current as unknown as HTMLCanvasElement);
    hud.setPlayerNames(postMatch.names.east, postMatch.names.west);
    hud.setGames(postMatch.gamesHistory, postMatch.bestOf);
    return () => hud.dispose();
  }, [postMatch, isPlaying]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<{ destroy(): void } | null>(null);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('user_settings_v');
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
        });
      } catch {
        setSettings(defaultSettings);
      }
    }
  }, []);

  // Persist settings
  const saveSettings = () => {
    localStorage.setItem('user_settings_v', JSON.stringify(settings));
    alert('Settings saved!');
  };

  // Reset to defaults
  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.removeItem('user_settings_v');
  };

  // Boot game when we enter "playing" and a canvas is present; teardown on exit
  useEffect(() => {
    if (!isPlaying || !canvasRef.current) return;

    let cancelled = false;

    (async () => {
      // Lazy-load Babylon + host adapter only when starting the game
      //console.log('[LocalGame] Attempting to lazy-load Pong...');
      try {
        const { bootstrapPong } = await import('../../game/host/dom-embed');
        if (cancelled) {
          //console.log('[LocalGame] Cancelled before bootstrap.');
          return;
        }
        //console.log('[LocalGame] bootstrapPong loaded, booting...');
        const app = await bootstrapPong(canvasRef.current!, {
          player1: settings.player1,
          player2: settings.player2,
        });
        appRef.current = app;
      } catch (e) {
        console.error('[LocalGame] Failed to start Pong', e);
        setIsPlaying(false);
      }
    })();

    return () => {
      cancelled = true;
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
          className="game-quit-button absolute right-5 top-5"
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
      <div className="relative h-screen w-full overflow-hidden">
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
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center space-y-6 bg-black/60 text-white">
          <h1 className="text-4xl font-bold">Local Game Settings</h1>

          {/* Player Settings Row */}
          <div className="flex flex-row space-x-8">
            {/* Player 1 Settings */}
            <div className="space-y-4 rounded-lg border-2 border-blue-400 p-4">
              <h2 className="text-2xl font-semibold text-blue-400">Player 1</h2>
              <label className="block font-semibold">Name</label>
              <input
                type="text"
                value={settings.player1.name}
                onChange={(e) =>
                  setSettings({ ...settings, player1: { ...settings.player1, name: e.target.value } })
                }
                className="w-64 rounded border border-white/20 bg-black/40 px-3 py-2 outline-none placeholder:text-white/40 focus:border-white/40"
                placeholder="Player 1"
              />
              <label className="block font-semibold">Paddle Color</label>
              <input
                type="color"
                value={settings.player1.paddleColor}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    player1: { ...settings.player1, paddleColor: e.target.value },
                  })
                }
                className="h-10 w-20 cursor-pointer"
              />
            </div>

            {/* Player 2 Settings */}
            <div className="space-y-4 rounded-lg border-2 border-red-400 p-4">
              <h2 className="text-2xl font-semibold text-red-400">Player 2</h2>
              <label className="block font-semibold">Name</label>
              <input
                type="text"
                value={settings.player2.name}
                onChange={(e) =>
                  setSettings({ ...settings, player2: { ...settings.player2, name: e.target.value } })
                }
                className="w-64 rounded border border-white/20 bg-black/40 px-3 py-2 outline-none placeholder:text-white/40 focus:border-white/40"
                placeholder="Player 2"
              />
              <label className="block font-semibold">Paddle Color</label>
              <input
                type="color"
                value={settings.player2.paddleColor}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    player2: { ...settings.player2, paddleColor: e.target.value },
                  })
                }
                className="h-10 w-20 cursor-pointer"
              />
            </div>
          </div>

          {/* Accessibility (Global) */}
          <div className="space-y-4 rounded-lg border-2 border-green-400 p-4">
            <h2 className="text-2xl font-semibold text-green-400">Accessibility</h2>

            <div className="flex flex-col space-y-2">
              <label className="font-semibold">Color Blind Mode</label>
              <select
                value={settings.accessibility.colorBlindMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    accessibility: {
                      ...settings.accessibility,
                      colorBlindMode: e.target.value as AccessibilitySettings['colorBlindMode'],
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

          {/* Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={saveSettings}
              className="rounded border border-green-400 px-6 py-2 text-green-400 transition hover:bg-green-400 hover:text-black"
            >
              Save as Default
            </button>
            <button
              onClick={resetSettings}
              className="rounded border border-red-400 px-6 py-2 text-red-400 transition hover:bg-red-400 hover:text-black"
            >
              Reset to Default
            </button>
          </div>

          {/* Play button */}
          <button
            onClick={handlePlay}
            className="rounded-lg border-2 border-pink-500 px-12 py-4 text-2xl font-bold text-pink-500 shadow-lg transition hover:bg-pink-500 hover:text-black"
          >
            Play 🚀
          </button>
        </div>
      </div>
    );
  }

  // Post-match results view (reusing in-game HUD scoreboard)
  const eastName = postMatch.names.east || 'Player 1';
  const westName = postMatch.names.west || 'Player 2';
  const winnerName = postMatch.winner === 'east' ? eastName : westName;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Video Background */}
      <video autoPlay loop muted playsInline className="absolute left-0 top-0 z-0 h-full w-full object-cover">
        <source src="/src/assets/gif.mp4" type="video/mp4" />
      </video>

      {/* Results Overlay */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center space-y-6 bg-black/70 p-6 text-white">
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
