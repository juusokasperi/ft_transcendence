import type { GameState } from '../../model/state';
import type { TableEnd } from '@pong/shared';
/** Points-level win (single game): targetScore with winBy margin. */
export declare function hasGameWinner(s: GameState): TableEnd | null;
/**
 * Match-level win (best-of-N): first to ceil(N/2) games.
 * Pass in your running match games counters and the match best-of.
 */
export declare function hasMatchWinner(gamesWon: {
    east: number;
    west: number;
}, bestOf: number): TableEnd | null;
//# sourceMappingURL=win.d.ts.map