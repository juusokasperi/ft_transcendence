import type { TournamentSize } from './net/messageTypes';

type EnvSource = Record<string, string | undefined>;

const env: EnvSource = import.meta.env ?? {};

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[OnlineGame]', ...args);
  }
};

const numberFromEnv = (key: string, fallback: number) => {
  const raw = env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    if (import.meta.env?.DEV) {
      debugLog(`[config] Invalid numeric value for ${key}: "${raw}". Falling back to ${fallback}.`);
    }
    return fallback;
  }
  return parsed;
};

const allowedTournamentSizes: TournamentSize[] = [4, 8, 16];

const tournamentSizeFromEnv = (key: string, fallback: TournamentSize): TournamentSize => {
  const raw = env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return (allowedTournamentSizes as number[]).includes(parsed)
    ? (parsed as TournamentSize)
    : fallback;
};

export const TOURNAMENT_SIZE: TournamentSize = tournamentSizeFromEnv('VITE_TOURNAMENT_SIZE', 4);
export const RECENT_TOURNAMENT_WINDOW_MS = numberFromEnv(
  'VITE_RECENT_TOURNAMENT_WINDOW_MS',
  6 * 60 * 60 * 1000,
);
export const MAX_VISIBLE_TOURNAMENTS = numberFromEnv('VITE_MAX_VISIBLE_TOURNAMENTS', 8);
