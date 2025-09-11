import type { TableEnd } from './ids';
export type GameRules = {
    targetScore: number;
    winBy: number;
    servesPerTurn: number;
    deuceServesPerTurn: number;
    deuceAt?: number;
};
export type MatchRules = {
    bestOf: 3 | 5 | 7;
    switchEndsEachGame: boolean;
    decidingGameMidSwapAtPoints?: number;
    alternateInitialServerEachGame: boolean;
};
export type Ruleset = {
    game: GameRules;
    match: MatchRules;
};
export declare const sideOpposite: (s: TableEnd) => TableEnd;
//# sourceMappingURL=rules.d.ts.map