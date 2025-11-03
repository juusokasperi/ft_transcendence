import type { Ruleset } from '@pong/shared';
import type { ControllerScheme } from '../../../../games/pong/modes/shared/preferences';
import { sanitizeAliasInput } from '../../../../utils/alias';

export type AccessibilitySettings = {
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'highContrast';
  photoSensitiveMode: 'none' | 'reducedFX' | 'noFlash';
};

export type PlayerSettings = {
  name: string;
  paddleColor: string;
  controller: ControllerScheme;
};

export type UserSettings = {
  player1: PlayerSettings;
  player2: PlayerSettings;
  accessibility: AccessibilitySettings;
  rules: Ruleset;
};

const COLOR_BLIND_MODES: ReadonlyArray<AccessibilitySettings['colorBlindMode']> = [
  'none',
  'protanopia',
  'deuteranopia',
  'tritanopia',
  'highContrast',
];

const PHOTO_SENSITIVE_MODES: ReadonlyArray<AccessibilitySettings['photoSensitiveMode']> = [
  'none',
  'reducedFX',
  'noFlash',
];

const CONTROLLER_SCHEMES: ReadonlyArray<ControllerScheme> = ['wasd', 'arrows'];

const BEST_OF_MODES: ReadonlyArray<Ruleset['match']['bestOf']> = [3, 5, 7];

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
  const sanitized = {
    ...settings,
    player1: { ...settings.player1, name: sanitizeAliasInput(settings.player1.name) },
    player2: { ...settings.player2, name: sanitizeAliasInput(settings.player2.name) },
  };
  storage.setItem(key, JSON.stringify(sanitized));
}

export function clearStoredSettings(storage: Storage, key: string): void {
  storage.removeItem(key);
}

export function getBestOf(
  value: unknown,
  fallback: Ruleset['match']['bestOf'],
): Ruleset['match']['bestOf'] {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (BEST_OF_MODES.includes(numeric as Ruleset['match']['bestOf'])) {
    return numeric as Ruleset['match']['bestOf'];
  }
  return fallback;
}

export function ensureDistinctControllers(
  player1: PlayerSettings,
  player2: PlayerSettings,
): { player1: PlayerSettings; player2: PlayerSettings } {
  if (player1.controller === player2.controller) {
    if (player1.controller === 'wasd') {
      return {
        player1,
        player2: { ...player2, controller: 'arrows' },
      };
    }
    return {
      player1: { ...player1, controller: 'wasd' },
      player2,
    };
  }
  return { player1, player2 };
}

function parseStoredSettings(raw: string, defaults: UserSettings): UserSettings {
  try {
    const parsed = JSON.parse(raw);
    const player1 = normalizePlayerSettings(parsed?.player1, defaults.player1);
    const player2 = normalizePlayerSettings(parsed?.player2, defaults.player2);
    const adjusted = ensureDistinctControllers(player1, player2);
    return {
      player1: adjusted.player1,
      player2: adjusted.player2,
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
  let name = typeof record.name === 'string' ? record.name : '';
  name = sanitizeAliasInput(name);
  if (!name) {
    name = sanitizeAliasInput(fallback.name);
  }
  const paddleColor =
    typeof record.paddleColor === 'string' && record.paddleColor.trim()
      ? record.paddleColor
      : fallback.paddleColor;
  const controller = CONTROLLER_SCHEMES.includes(record.controller as ControllerScheme)
    ? (record.controller as ControllerScheme)
    : fallback.controller;

  return {
    name,
    paddleColor,
    controller,
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

function isValidColorBlindMode(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    COLOR_BLIND_MODES.includes(value as AccessibilitySettings['colorBlindMode'])
  );
}

function isValidPhotoSensitiveMode(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    PHOTO_SENSITIVE_MODES.includes(value as AccessibilitySettings['photoSensitiveMode'])
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
