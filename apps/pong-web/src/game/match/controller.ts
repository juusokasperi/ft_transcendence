// src/game/match/controller.ts
import type { TableEnd } from "@shared/domain/ids";
import type { GameState } from "@game/model/state";
import { createInitialState } from "@game/model/state";
import type { Ruleset } from "@shared/domain/rules";
import { sideOpposite } from "@shared/domain/rules";
import { serveFrom } from "@game/systems/flow/service";
import { PAUSE_BETWEEN_GAMES_MS, PAUSE_MATCH_OVER_MS } from "@game/constants";

export function createMatchController(
  bounds: GameState["bounds"],
  rules: Ruleset,
  initialServer: TableEnd = "east",
) {
  let game = addRulesToState(createInitialState(bounds, initialServer), rules);
  let currentGameIndex = 1;

  // ⚠️ Old bug: this counted by *table end*.
  const gamesWonByEnd = { east: 0, west: 0 };

  // ✅ New: count by player identity. Define P1 as the player who starts the match on EAST.
  let p1AtEastNow = true; // flips whenever we swap sides
  const gamesWonByPlayer = { P1: 0, P2: 0 };

  let matchWinner: TableEnd | undefined;
  let endsFlippedThisGame = false;
  let midSwapDoneThisGame = false;
  let initialServerThisGame: TableEnd = initialServer;

  // Immutable history for HUD
  const gamesHistory: Array<{
    gameIndex: number;
    east: number;
    west: number;
    winner: TableEnd;
  }> = [];

  function addRulesToState(s: GameState, r: Ruleset): GameState {
    return {
      ...s,
      serviceTurnsLeft: r.game.servesPerTurn,
      params: {
        ...s.params,
        targetScore: r.game.targetScore,
        winBy: r.game.winBy,
        servesPerTurn: r.game.servesPerTurn,
        deuceServesPerTurn: r.game.deuceServesPerTurn,
        deuceAt: r.game.deuceAt!, // resolved
      } as any,
    };
  }

  function snapshot() {
    return {
      bestOf: rules.match.bestOf,
      currentGameIndex,
      gamesWon: { ...gamesWonByEnd }, // kept for debugging/compat
      matchWinner,
      endsFlippedThisGame,
      midSwapDoneThisGame,
      initialServerThisGame,
      gamesHistory: [...gamesHistory],
    };
  }

  const endToPlayer = (end: TableEnd): "P1" | "P2" =>
    end === "east" ? (p1AtEastNow ? "P1" : "P2") : p1AtEastNow ? "P2" : "P1";

  /** Call AFTER physics/flow step each frame. */
  function afterPhysicsStep(next: GameState) {
    game = next;
    const events: {
      swapSidesNow?: true;
      gameOver?: { winner: TableEnd; gameIndex: number };
      matchOver?: { winner: TableEnd };
    } = {};

    // Deciding-game mid swap at threshold → flip players’ ends now.
    const deciding = currentGameIndex === rules.match.bestOf;
    if (
      deciding &&
      !midSwapDoneThisGame &&
      rules.match.decidingGameMidSwapAtPoints &&
      (game.points.east >= rules.match.decidingGameMidSwapAtPoints ||
        game.points.west >= rules.match.decidingGameMidSwapAtPoints)
    ) {
      midSwapDoneThisGame = true;
      p1AtEastNow = !p1AtEastNow; // ⟵ keep player↔end mapping correct
      events.swapSidesNow = true;
    }

    // Ensure a timer exists during between-games pause
    if (
      game.phase === "pauseBetweenGames" &&
      game.tPauseBtwGamesMs === undefined
    ) {
      game = { ...game, tPauseBtwGamesMs: PAUSE_BETWEEN_GAMES_MS };
    }

    // Transition out of between-games pause when timer hits 0
    if (
      game.phase === "pauseBetweenGames" &&
      (game.tPauseBtwGamesMs ?? 0) <= 0
    ) {
      currentGameIndex++;
      endsFlippedThisGame = false;
      midSwapDoneThisGame = false;

      if (rules.match.switchEndsEachGame) {
        endsFlippedThisGame = true;
        p1AtEastNow = !p1AtEastNow; // ⟵ sides actually swap at game start
        events.swapSidesNow = true;
      }

      const nextInitialServer = rules.match.alternateInitialServerEachGame
        ? sideOpposite(initialServerThisGame)
        : initialServerThisGame;
      initialServerThisGame = nextInitialServer;

      const fresh = addRulesToState(
        createInitialState(game.bounds, nextInitialServer),
        rules,
      );
      game = serveFrom(nextInitialServer, fresh);

      return { state: game, events };
    }

    // Game finished this frame?
    if (game.phase === "gameOver" && game.gameWinner) {
      // Record immutable history once
      if (!gamesHistory.some((g) => g.gameIndex === currentGameIndex)) {
        gamesHistory.push({
          gameIndex: currentGameIndex,
          east: game.points.east,
          west: game.points.west,
          winner: game.gameWinner,
        });
      }

      // Keep old end-based counters for reference (not used to decide match)
      gamesWonByEnd[game.gameWinner]++;

      // ✅ Player-centric win counting
      const winnerPlayer = endToPlayer(game.gameWinner);
      gamesWonByPlayer[winnerPlayer]++;

      events.gameOver = {
        winner: game.gameWinner,
        gameIndex: currentGameIndex,
      };

      // Decide match by player wins (first to ceil(bestOf/2))
      const need = Math.ceil(rules.match.bestOf / 2);
      const p1Won = gamesWonByPlayer.P1 >= need;
      const p2Won = gamesWonByPlayer.P2 >= need;

      if (p1Won || p2Won) {
        // Express match winner as the TABLE END they occupy *right now* (for completeness)
        matchWinner = (
          p1Won
            ? p1AtEastNow
              ? "east"
              : "west"
            : p1AtEastNow
              ? "west"
              : "east"
        ) as TableEnd;

        events.matchOver = { winner: matchWinner };
        game = {
          ...game,
          phase: "matchOver",
          tMatchOverMs: PAUSE_MATCH_OVER_MS,
        };
        return { state: game, events };
      }

      // Otherwise: enter between-games pause
      const ms = game.tPauseBtwGamesMs ?? PAUSE_BETWEEN_GAMES_MS;
      game = { ...game, phase: "pauseBetweenGames", tPauseBtwGamesMs: ms };
      return { state: game, events };
    }

    return { state: game, events };
  }

  return { getGame: () => game, getSnapshot: snapshot, afterPhysicsStep };
}
