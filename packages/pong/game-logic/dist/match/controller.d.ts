import type { GameState } from '../model/state';
import type { TableEnd } from '@pong/shared';
import type { Ruleset } from '@pong/shared';
export declare function createMatchController(bounds: GameState['bounds'], rules: Ruleset, initialServer?: TableEnd): {
    getGame: () => GameState;
    getSnapshot: () => {
        bestOf: 5 | 3 | 7;
        currentGameIndex: number;
        gamesWon: {
            east: number;
            west: number;
        };
        matchWinner: TableEnd | undefined;
        endsFlippedThisGame: boolean;
        midSwapDoneThisGame: boolean;
        initialServerThisGame: TableEnd;
        gamesHistory: {
            gameIndex: number;
            east: number;
            west: number;
            winner: TableEnd;
        }[];
    };
    afterPhysicsStep: (next: GameState) => {
        state: GameState;
        events: {
            swapSidesNow?: true;
            gameOver?: {
                winner: TableEnd;
                gameIndex: number;
            };
            matchOver?: {
                winner: TableEnd;
            };
        };
    };
};
//# sourceMappingURL=controller.d.ts.map