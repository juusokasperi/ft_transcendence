import type { TableEnd } from '@pong/shared';
/** Paddle state along Z (depth). */
export type Paddle = {
    z: number;
    vz: number;
};
/** Ball kinematics in X (length) and Z (depth). */
export type Ball = {
    x: number;
    z: number;
    vx: number;
    vz: number;
};
/**
 * High-level flow:
 * - serveLeft / serveRight: awaiting serve toss/hit
 * - rally: ball in play
 * - pauseBtwPoints: short pause after a point
 * - gameOver: current game concluded (someone reached targetScore, winBy)
 * - matchOver: match concluded (someone reached targetGames)
 */
export type Phase = 'serveEast' | 'serveWest' | 'rally' | 'pauseBtwPoints' | 'gameOver' | 'pauseBetweenGames' | 'matchOver';
/**
 * GameState (kept name to avoid breaking imports) now uses table-tennis terms:
 * - points: running points within the current game (to 11, win by 2)
 * - games: games won within the match (best of N)
 */
export type GameState = {
    paddles: {
        P1: Paddle;
        P2: Paddle;
    };
    ball: Ball;
    /** Current game's points. */
    points: {
        east: number;
        west: number;
    };
    /** Match score in games (best-of). */
    games: {
        east: number;
        west: number;
    };
    phase: Phase;
    /** Remaining ms for the pause between rallies. */
    tPauseBtwPointsMs?: number;
    /** Which side will serve next after pause between points. */
    nextServe?: TableEnd;
    /** Current server and remaining serves in the current turn (block). */
    server: TableEnd;
    serviceTurnsLeft: number;
    /** Remaining ms for the pause between games. */
    tPauseBtwGamesMs?: number;
    /** Remaining ms for the pause at match end. */
    tMatchOverMs?: number;
    /** Winners at game/match boundaries. */
    gameWinner?: TableEnd;
    matchWinner?: TableEnd;
    bounds: {
        halfLengthX: number;
        halfWidthZ: number;
        paddleHalfDepthZ: number;
        leftPaddleX: number;
        rightPaddleX: number;
        ballRadius: number;
    };
    params: {
        /** Gameplay/physics knobs */
        paddleSpeed: number;
        ballSpeed: number;
        zEnglish: number;
        restitutionWall: number;
        /** Scoring/service rules (table-tennis style by default) */
        targetScore: number;
        winBy: number;
        servesPerTurn: number;
        deuceServesPerTurn: number;
        /** Deuce threshold; default is targetScore - 1. */
        deuceAt: number;
        /** Match format */
        bestOf: number;
        targetGames: number;
    };
};
export declare function createInitialState(bounds: GameState['bounds'], initialServer: TableEnd): GameState;
//# sourceMappingURL=state.d.ts.map