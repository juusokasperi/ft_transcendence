import type { ControllerScheme } from '../../../../games/pong/modes/shared/preferences';
import type { UserSettings } from './storage';

export const STORAGE_KEY = 'pong_local_settings_v1';

export const CONTROLLER_OPTIONS: ReadonlyArray<{
  value: ControllerScheme;
  label: string;
}> = [
  { value: 'wasd', label: 'W / S' },
  { value: 'arrows', label: 'Arrow Up / Arrow Down' },
];

export const defaultSettings: UserSettings = {
  player1: { name: 'Ping', paddleColor: '#00ff66', controller: 'wasd' },
  player2: { name: 'Pong', paddleColor: '#bf5fff', controller: 'arrows' },
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
