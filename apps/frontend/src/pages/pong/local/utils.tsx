import type { Ruleset } from '@pong/shared';

export type AccessibilitySettings = {
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'highContrast';
  photoSensitiveMode: 'none' | 'reducedFX' | 'noFlash';
};

export type PlayerSettings = {
  name: string;
  paddleColor: string;
};

export type UserSettings = {
  player1: PlayerSettings;
  player2: PlayerSettings;
  accessibility: AccessibilitySettings;
  rules: Ruleset;
};

const colorBlindModes: AccessibilitySettings['colorBlindMode'][] = [
  'none',
  'protanopia',
  'deuteranopia',
  'tritanopia',
  'highContrast',
];

const photoSensitiveModes: AccessibilitySettings['photoSensitiveMode'][] = [
  'none',
  'reducedFX',
  'noFlash',
];

const bestOfModes: Ruleset['match']['bestOf'][] = [3, 5, 7];

export function readSettingsFromStorage(
  storage: Storage,
  key: string,
  defaults: UserSettings,
): UserSettings {
  const saved = storage.getItem(key);
  if (!saved) {
    return defaults;
  }

  return parseStoredSettings(saved, defaults);
}

export function writeSettingsToStorage(
  storage: Storage,
  key: string,
  settings: UserSettings,
): void {
  storage.setItem(key, JSON.stringify(settings));
}

export function clearStoredSettings(storage: Storage, key: string): void {
  storage.removeItem(key);
}

function parseStoredSettings(raw: string, defaults: UserSettings): UserSettings {
  try {
    const parsed = JSON.parse(raw);
    return {
      player1: normalizePlayerSettings(parsed?.player1, defaults.player1),
      player2: normalizePlayerSettings(parsed?.player2, defaults.player2),
      accessibility: normalizeAccessibility(parsed?.accessibility, defaults.accessibility),
      rules: normalizeRules(parsed?.rules, defaults.rules),
    };
  } catch {
    return defaults;
  }
}

function normalizePlayerSettings(value: unknown, fallback: PlayerSettings): PlayerSettings {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === 'string' && record.name.trim() ? record.name : fallback.name;
  const paddleColor =
    typeof record.paddleColor === 'string' && record.paddleColor.trim()
      ? record.paddleColor
      : fallback.paddleColor;

  return {
    name,
    paddleColor,
  };
}

function normalizeAccessibility(
  value: unknown,
  fallback: AccessibilitySettings,
): AccessibilitySettings {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const colorBlindMode = isValidColorBlindMode(record.colorBlindMode)
    ? (record.colorBlindMode as AccessibilitySettings['colorBlindMode'])
    : fallback.colorBlindMode;
  const photoSensitiveMode = isValidPhotoSensitiveMode(record.photoSensitiveMode)
    ? (record.photoSensitiveMode as AccessibilitySettings['photoSensitiveMode'])
    : fallback.photoSensitiveMode;

  return {
    colorBlindMode,
    photoSensitiveMode,
  };
}

function normalizeRules(value: unknown, fallback: Ruleset): Ruleset {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const game =
    record.game && typeof record.game === 'object' ? (record.game as Record<string, unknown>) : {};
  const match =
    record.match && typeof record.match === 'object'
      ? (record.match as Record<string, unknown>)
      : {};

  return {
    game: {
      targetScore: getNumber(game.targetScore, fallback.game.targetScore, 1),
      winBy: getNumber(game.winBy, fallback.game.winBy, 1),
      servesPerTurn: getNumber(game.servesPerTurn, fallback.game.servesPerTurn, 1),
      deuceServesPerTurn: getNumber(game.deuceServesPerTurn, fallback.game.deuceServesPerTurn, 1),
      deuceAt: getNumberOrUndefined(game.deuceAt, fallback.game.deuceAt, 1),
    },
    match: {
      bestOf: getBestOf(match.bestOf, fallback.match.bestOf),
      switchEndsEachGame: getBoolean(match.switchEndsEachGame, fallback.match.switchEndsEachGame),
      decidingGameMidSwapAtPoints: getNumberOrUndefined(
        match.decidingGameMidSwapAtPoints,
        fallback.match.decidingGameMidSwapAtPoints,
        1,
      ),
      alternateInitialServerEachGame: getBoolean(
        match.alternateInitialServerEachGame,
        fallback.match.alternateInitialServerEachGame,
      ),
    },
  };
}

export function getBestOf(
  value: unknown,
  fallback: Ruleset['match']['bestOf'],
): Ruleset['match']['bestOf'] {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (bestOfModes.includes(numeric as Ruleset['match']['bestOf'])) {
    return numeric as Ruleset['match']['bestOf'];
  }
  return fallback;
}

function isValidColorBlindMode(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    colorBlindModes.includes(value as AccessibilitySettings['colorBlindMode'])
  );
}

function isValidPhotoSensitiveMode(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    photoSensitiveModes.includes(value as AccessibilitySettings['photoSensitiveMode'])
  );
}

function getNumber<T extends number>(value: unknown, fallback: T, min?: number): T {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (min !== undefined && numeric < min) {
    return fallback;
  }
  return numeric as T;
}

function getNumberOrUndefined(
  value: unknown,
  fallback: number | undefined,
  min?: number,
): number | undefined {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (min !== undefined && numeric < min) {
    return fallback;
  }
  return numeric;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
