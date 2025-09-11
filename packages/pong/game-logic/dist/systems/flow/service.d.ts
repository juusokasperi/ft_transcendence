import type { GameState } from '../../model/state';
import type { TableEnd } from '@pong/shared';
export declare function inDeuceMode(s: GameState): boolean;
/** Table-tennis style service rotation (pre/post deuce). */
export declare function rotateService(s: GameState): {
    nextServer: TableEnd;
    nextTurns: number;
};
/** Determines the next serve from the given table end. */
export declare function serveFrom(tableEnd: TableEnd, s: GameState): GameState;
//# sourceMappingURL=service.d.ts.map