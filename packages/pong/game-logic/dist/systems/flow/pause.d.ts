import type { GameState } from '../../model/state';
/**
 * Single pause step handling:
 * - pauseBtwPoints: counts down then starts the next serve
 * - pauseBetweenGames: counts down; next game boot is decided by match controller
 * - matchOver: counts down a victory pause; external UI decides what to do next
 */
export declare function stepPause(s: GameState, dt: number): GameState;
//# sourceMappingURL=pause.d.ts.map