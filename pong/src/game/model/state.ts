// src/game/state.ts
import { PAUSE_BETWEEN_POINTS_MS } from "@game/constants";
import type { TableEnd } from "@shared/domain/ids";

/** Paddle state along Z (depth). */
export type Paddle = { z: number; vz: number };

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
export type Phase =
  | "serveEast"
  | "serveWest"
  | "rally"
  | "pauseBtwPoints"
  | "gameOver"
  | "pauseBetweenGames"
  | "matchOver";

/**
 * GameState (kept name to avoid breaking imports) now uses table-tennis terms:
 * - points: running points within the current game (to 11, win by 2)
 * - games: games won within the match (best of N)
 */
export type GameState = {
  paddles: { P1: Paddle; P2: Paddle };
  ball: Ball;

  /** Current game's points. */
  points: { east: number; west: number };

  /** Match score in games (best-of). */
  games: { east: number; west: number };

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
    halfLengthX: number; // table half-length along X
    halfWidthZ: number; // table half-width along Z
    paddleHalfDepthZ: number; // half-size of paddle along Z
    leftPaddleX: number; // world X
    rightPaddleX: number; // world X
    ballRadius: number;
  };

  params: {
    /** Gameplay/physics knobs */
    paddleSpeed: number; // m/s
    ballSpeed: number; // base rally speed (m/s)
    zEnglish: number; // how much paddle vz affects ball.vz (0..1+)
    restitutionWall: number;

    /** Scoring/service rules (table-tennis style by default) */
    targetScore: number; // points to win a game (e.g., 11)
    winBy: number; // difference to win a game (e.g., 2)
    servesPerTurn: number; // pre-deuce: serves before switching (e.g., 2)
    deuceServesPerTurn: number; // at deuce: serves before switching (e.g., 1)
    /** Deuce threshold; default is targetScore - 1. */
    deuceAt: number;

    /** Match format */
    bestOf: number; // must be odd: 3, 5, 7...
    targetGames: number; // games needed to win the match (ceil(bestOf/2))
  };
};

export function createInitialState(
  bounds: GameState["bounds"],
  initialServer: TableEnd,
): GameState {
  // ——— Table-tennis defaults ———
  const targetScore = 11;
  const winBy = 2;
  const servesPerTurn = 2;
  const deuceServesPerTurn = 1;
  const deuceAt = targetScore - 1;

  // Match defaults (best of 5 games → first to 3)
  const bestOf = 5;
  const targetGames = Math.ceil(bestOf / 2);

  return {
    paddles: { P1: { z: 0, vz: 0 }, P2: { z: 0, vz: 0 } },
    ball: { x: 0, z: 0, vx: 0, vz: 0 },

    // points (this game) and games (match)
    points: { east: 0, west: 0 },
    games: { east: 0, west: 0 },

    // Boot with east serving first (and 2 serves in this block)
    phase: initialServer === "east" ? "serveEast" : "serveWest",
    tPauseBtwPointsMs: PAUSE_BETWEEN_POINTS_MS,
    nextServe: undefined,
    server: initialServer,
    serviceTurnsLeft: servesPerTurn,

    tPauseBtwGamesMs: undefined,
    gameWinner: undefined,

    matchWinner: undefined,

    bounds,
    params: {
      // physics/gameplay
      paddleSpeed: 2.2,
      ballSpeed: 1.8,
      zEnglish: 0.75,
      restitutionWall: 1.0,

      // scoring/service rules
      targetScore,
      winBy,
      servesPerTurn,
      deuceServesPerTurn,
      deuceAt,

      // match rules
      bestOf,
      targetGames,
    },
  };
}
