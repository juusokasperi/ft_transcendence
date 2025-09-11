import React, { useEffect, useState } from 'react';

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
  player1: { paddleColor: '#ffffff' },
  player2: { paddleColor: '#ff0000' },
  accessibility: { colorBlindMode: 'none', photoSensitiveMode: 'none' },
};

const LocalGame: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);

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

  // Save to localStorage
  const saveSettings = () => {
    localStorage.setItem('user_settings_v', JSON.stringify(settings));
    alert('Settings saved!');
  };

  // Reset to defaults
  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.removeItem('user_settings_v');
  };

  // Play handler
  const handlePlay = () => {
    console.log('Starting local game with settings:', settings);
    // TODO: integrate with BabylonJS Pong
  };

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
