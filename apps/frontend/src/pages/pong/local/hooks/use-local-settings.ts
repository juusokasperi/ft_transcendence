import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { defaultSettings, STORAGE_KEY } from '../utils/constants';
import {
  clearStoredSettings,
  ensureDistinctControllers,
  readSettingsFromStorage,
  writeSettingsToStorage,
} from '../utils/storage';
import type { UserSettings } from '../utils/storage';

type UseLocalSettingsOptions = {
  storageKey?: string;
  storage?: Storage | null;
};

export type LocalSettingsActions = {
  update: (updater: SetStateAction<UserSettings>) => void;
  save: (settings?: UserSettings) => void;
  reset: () => void;
  resetRules: () => void;
  restore: () => void;
};

export type LocalSettingsState = {
  settings: UserSettings;
  defaults: UserSettings;
};

export type UseLocalSettingsReturn = LocalSettingsState & LocalSettingsActions;

const cloneSettings = (settings: UserSettings): UserSettings => ({
  player1: { ...settings.player1 },
  player2: { ...settings.player2 },
  accessibility: { ...settings.accessibility },
  rules: {
    game: { ...settings.rules.game },
    match: { ...settings.rules.match },
  },
});

export function useLocalSettings(options: UseLocalSettingsOptions = {}): UseLocalSettingsReturn {
  const storageKey = options.storageKey ?? STORAGE_KEY;
  const storageRef = useRef<Storage | null>(
    options.storage ?? (typeof window !== 'undefined' ? window.localStorage : null),
  );
  const [settings, setSettings] = useState<UserSettings>(() => cloneSettings(defaultSettings));

  // Keep reference storage up to date if caller provides a new one
  useEffect(() => {
    if (options.storage) {
      storageRef.current = options.storage;
    }
  }, [options.storage]);

  const applyUpdate = useCallback((next: UserSettings): UserSettings => {
    const cloned = cloneSettings(next);
    const { player1, player2 } = ensureDistinctControllers(cloned.player1, cloned.player2);
    return {
      ...cloned,
      player1,
      player2,
    };
  }, []);

  const update = useCallback((updater: SetStateAction<UserSettings>) => {
    setSettings((prev) => {
      const draft = typeof updater === 'function' ? (updater as (p: UserSettings) => UserSettings)(prev) : updater;
      return applyUpdate(draft);
    });
  }, [applyUpdate]);

  const restore = useCallback(() => {
    const storage = storageRef.current;
    if (!storage) {
      setSettings(cloneSettings(defaultSettings));
      return;
    }

    const restored = readSettingsFromStorage(storage, storageKey, defaultSettings);
    setSettings(applyUpdate(restored));
  }, [applyUpdate, storageKey]);

  useEffect(() => {
    restore();
  }, [restore]);

  const save = useCallback(
    (target?: UserSettings) => {
      const storage = storageRef.current;
      if (!storage) return;
      const payload = applyUpdate(target ?? settings);
      writeSettingsToStorage(storage, storageKey, payload);
    },
    [applyUpdate, settings, storageKey],
  );

  const reset = useCallback(() => {
    const storage = storageRef.current;
    setSettings(cloneSettings(defaultSettings));
    if (storage) {
      clearStoredSettings(storage, storageKey);
    }
  }, [storageKey]);

  const defaultRules = useMemo(() => ({
    game: { ...defaultSettings.rules.game },
    match: { ...defaultSettings.rules.match },
  }), []);

  const defaults = useMemo(() => cloneSettings(defaultSettings), []);

  const resetRules = useCallback(() => {
    update((prev) => ({
      ...prev,
      rules: {
        game: { ...defaultRules.game },
        match: { ...defaultRules.match },
      },
    }));
  }, [defaultRules, update]);

  return {
    settings,
    defaults,
    update,
    save,
    reset,
    resetRules,
    restore,
  };
}
