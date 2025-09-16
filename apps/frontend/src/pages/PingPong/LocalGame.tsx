import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

type AccessibilitySettings = {
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'highContrast';
  photoSensitiveMode: 'none' | 'reducedFX' | 'noFlash';
};

type PlayerSettings = {
  paddleColor: string;
};

type UserSettings = {
  player1: PlayerSettings;
  player2: PlayerSettings;
  accessibility: AccessibilitySettings;
};

const defaultSettings: UserSettings = {
  player1: { paddleColor: '#795fecff' },
  player2: { paddleColor: '#ff0000' },
  accessibility: { colorBlindMode: 'none', photoSensitiveMode: 'none' },
};

const LocalGame: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isPlaying, setIsPlaying] = useState(false);

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
            paddleColor: parsed.player1?.paddleColor || defaultSettings.player1.paddleColor,
          },
          player2: {
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
        const app = await bootstrapPong(canvasRef.current!);
        appRef.current = app;
        // Ensure keyboard input is captured without requiring a click
        //requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
        //console.log('[LocalGame] Pong booted:', app);
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
    // TODO: plumb `settings` into your render layer when exposed
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

  // Settings view (+ Play button)
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
            <label className="block font-semibold">Paddle Color</label>
            <input
              type="color"
              value={settings.player1.paddleColor}
              onChange={(e) =>
                setSettings({ ...settings, player1: { paddleColor: e.target.value } })
              }
              className="h-10 w-20 cursor-pointer"
            />
          </div>

          {/* Player 2 Settings */}
          <div className="space-y-4 rounded-lg border-2 border-red-400 p-4">
            <h2 className="text-2xl font-semibold text-red-400">Player 2</h2>
            <label className="block font-semibold">Paddle Color</label>
            <input
              type="color"
              value={settings.player2.paddleColor}
              onChange={(e) =>
                setSettings({ ...settings, player2: { paddleColor: e.target.value } })
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
};

export default LocalGame;
