import type { GameState } from '@pong/game-logic';
import type { DomScoreboardAPI } from './scoreboard';
import type { TableEnd, MatchSnapshot } from '@pong/shared';

export type NamesByEnd = { east: string; west: string };

// Minimal shape we need from the match snapshot
// Coalescing cache per HUD instance (avoids redundant DOM updates)
type HudCache = {
  pointsEast: number;
  pointsWest: number;
  server: TableEnd | null;
  deuce: boolean;
  names?: { east: string; west: string };
  match?: { bestOf: number; currentGameIndex: number; historyRef: any; historyLen: number };
};
const HUD_CACHE = new WeakMap<DomScoreboardAPI, HudCache>();

export function updateHUD(
  hud: DomScoreboardAPI,
  s: GameState,
  names?: NamesByEnd,
  match?: MatchSnapshot,
) {
  const c: HudCache = HUD_CACHE.get(hud) || {
    pointsEast: -1,
    pointsWest: -1,
    server: null,
    deuce: false,
  };

  // Coalesce points
  const pe = s.points.east | 0;
  const pw = s.points.west | 0;
  if (pe !== c.pointsEast || pw !== c.pointsWest) {
    hud.setPoints(pe, pw);
    c.pointsEast = pe;
    c.pointsWest = pw;
  }

  // Coalesce server
  if (s.server !== c.server) {
    hud.setServer(s.server);
    c.server = s.server;
  }

  // Coalesce deuce
  const deuce = pe >= (s.params.deuceAt | 0) && pw >= (s.params.deuceAt | 0);
  if (deuce !== c.deuce) {
    hud.setDeuce(deuce);
    c.deuce = deuce;
  }

  // Coalesce names (optional)
  if (names) {
    if (!c.names || c.names.east !== names.east || c.names.west !== names.west) {
      hud.setPlayerNames(names.east, names.west);
      c.names = { east: names.east, west: names.west };
    }
  }

  // Coalesce match boxes (optional)
  if (match) {
    const historyRef = match.gamesHistory;
    const historyLen = historyRef?.length ?? 0;
    const prev = c.match;
    const changed =
      !prev ||
      prev.bestOf !== match.bestOf ||
      prev.currentGameIndex !== match.currentGameIndex ||
      prev.historyRef !== historyRef ||
      prev.historyLen !== historyLen;
    if (changed) {
      hud.setGames(match.gamesHistory || [], match.bestOf, match.currentGameIndex);
      c.match = {
        bestOf: match.bestOf,
        currentGameIndex: match.currentGameIndex,
        historyRef,
        historyLen,
      };
    }
  }

  HUD_CACHE.set(hud, c);
}
