import type { DomScoreboardAPI } from '@pong/render';
import type { MatchSnapshot } from '@pong/shared';
import { updateHUD } from '@pong/render';

export type HudCache = {
  lastBestOf: number;
  lastCurrentGameIndex: number;
  lastHistoryRef: any | null;
};

export function createHudCache(): HudCache {
  return { lastBestOf: 0, lastCurrentGameIndex: 0, lastHistoryRef: null };
}

export function updateOnlineHUDIfChanged(
  hud: DomScoreboardAPI,
  stateForHUD: any,
  names: { east: string; west: string },
  snap: MatchSnapshot,
  historyForHUD: any,
  cache: HudCache,
) {
  const changed =
    snap.bestOf !== cache.lastBestOf ||
    snap.currentGameIndex !== cache.lastCurrentGameIndex ||
    historyForHUD !== cache.lastHistoryRef;

  updateHUD(
    hud,
    stateForHUD,
    names,
    changed
      ? {
          bestOf: snap.bestOf,
          currentGameIndex: snap.currentGameIndex,
          gamesHistory: historyForHUD,
        }
      : undefined,
  );

  if (changed) {
    cache.lastBestOf = snap.bestOf;
    cache.lastCurrentGameIndex = snap.currentGameIndex;
    cache.lastHistoryRef = historyForHUD;
  }
}
