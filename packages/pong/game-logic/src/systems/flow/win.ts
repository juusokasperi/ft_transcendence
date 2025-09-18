import type { GameState } from '../../model/state';
import type { TableEnd } from '@pong/shared';

/** Points-level win (single game): targetScore with winBy margin. */
export function hasGameWinner(s: GameState): TableEnd | null {
  const { targetScore, winBy } = s.params;
  const p1 = s.pointsByPlayer.P1 | 0;
  const p2 = s.pointsByPlayer.P2 | 0;
  const diff = p1 - p2;
  if ((p1 >= targetScore || p2 >= targetScore) && Math.abs(diff) >= winBy) {
    const winnerPlayer = diff > 0 ? 'P1' : 'P2';
    // Map back to current table end
    if (s.playerAtEnd.east === winnerPlayer) return 'east';
    return 'west';
  }
  return null;
}

/**
 * Match-level win (best-of-N): first to ceil(N/2) games.
 * Pass in your running match games counters and the match best-of.
 */
// Note: match-level win calculation is handled by the match controller
// using player-centric counting to remain robust across side swaps.
