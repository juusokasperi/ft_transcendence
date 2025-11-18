import type { GameState } from '@pong/game-logic';
import type { TableEnd } from '@pong/shared';
import type { GameHistoryEntry } from '@pong/shared';

/** Convert state to player rows when flipped is true (top row = P1). */
export function mapStateForPlayerRows(s: GameState, flipped: boolean): GameState {
  if (!flipped) return s;
  const swappedServer = (s.server === 'east' ? 'west' : 'east') as TableEnd;
  return {
    ...s,
    // Player-pinned totals for top/bottom rows
    points: { east: s.pointsByPlayer.P1, west: s.pointsByPlayer.P2 },
    server: swappedServer,
  };
}

/**
 * Map finished-game history for HUD rows.
 *
 * Pass-through today: the game controller already records history in player
 * space (top row = P1, bottom row = P2), so no transformation is required.
 *
 * Keep this adapter as a stable extension point for future needs, e.g.:
 * - Accept end-based history from a server and normalize to players.
 * - Add derived stats (diff, deuce flags, streaks, aggregates).
 * - Apply spectator flips or per-view customizations.
 */
export function mapHistoryForPlayers(history: GameHistoryEntry[] | undefined): GameHistoryEntry[] {
  return history ?? [];
}
