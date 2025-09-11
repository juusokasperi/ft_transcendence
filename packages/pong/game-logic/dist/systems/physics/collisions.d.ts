import type { GameState } from '../../model/state';
import type { FrameEvents } from '@pong/shared';
export declare function collideWalls(s: GameState, dt: number): {
    s: GameState;
    wallHit?: FrameEvents['wallHit'];
};
export declare function collidePaddle(s: GameState, dt: number): GameState;
//# sourceMappingURL=collisions.d.ts.map