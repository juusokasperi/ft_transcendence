import type { GameState } from '../model/state';
import { createInitialState } from '../model/state';
import { serveFrom } from '../systems/flow/service';
import { PAUSE_BETWEEN_GAMES_MS, PAUSE_MATCH_OVER_MS } from '../constants';
import type { TableEnd } from '@pong/shared';
import type { Ruleset, MatchSnapshot } from '@pong/shared';
import { sideOpposite } from '@pong/shared';
import type { GameHistoryEntry } from '@pong/shared';

export function createMatchController(
  bounds: GameState['bounds'],
  rules: Ruleset,
  initialServer: TableEnd = 'east',
) {
  let game = addRulesToState(createInitialState(bounds, initialServer), rules);
  let currentGameIndex = 1;

  const gamesWonByEnd: Record<TableEnd, number> = { east: 0, west: 0 };

  // New: count by player identity. Define P1 as the player who starts the match on EAST.
  let p1AtEastNow = true; // flips whenever we swap sides
  const gamesWonByPlayer: Record<'P1' | 'P2', number> = { P1: 0, P2: 0 };

  let matchWinner: TableEnd | undefined;
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
    const deuceAt = r.game.deuceAt ?? r.game.targetScore - 1;
    const targetGames = Math.ceil(r.match.bestOf / 2);
    const params: GameState['params'] = {
      ...s.params,
      targetScore: r.game.targetScore,
      winBy: r.game.winBy,
      servesPerTurn: r.game.servesPerTurn,
      deuceServesPerTurn: r.game.deuceServesPerTurn,
      deuceAt,
      // Keep match params in sync with rules as well
      bestOf: r.match.bestOf,
      targetGames,
    };
    return {
      ...s,
      serviceTurnsLeft: r.game.servesPerTurn,
      params,
    };
  }

  // Cache to avoid cloning history every tick when unchanged
  let lastSnapHistoryRef: GameHistoryEntry[] = [];
  let lastSnapHistoryLen = 0;

  function snapshot(): MatchSnapshot {
    // Only clone history when it actually changes length (i.e., end of a game)
    if (gamesHistory.length !== lastSnapHistoryLen) {
      lastSnapHistoryRef = [...gamesHistory];
      lastSnapHistoryLen = gamesHistory.length;
    }
    return {
      bestOf: rules.match.bestOf,
      currentGameIndex,
      gamesHistory: lastSnapHistoryRef,
    };
  }

  const endToPlayer = (end: TableEnd): 'P1' | 'P2' =>
    end === 'east' ? (p1AtEastNow ? 'P1' : 'P2') : p1AtEastNow ? 'P2' : 'P1';

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
      // Swap player occupancy in game state and mirror controller flag
      const swapped = {
        east: game.playerAtEnd.west,
        west: game.playerAtEnd.east,
      } as const;
      game = { ...game, playerAtEnd: swapped };
      p1AtEastNow = !p1AtEastNow; // keep controller mapping consistent
      events.swapSidesNow = true;
    }

    // Ensure a timer exists during between-games pause
    if (game.phase === 'pauseBetweenGames' && game.tPauseBtwGamesMs === undefined) {
      game = { ...game, tPauseBtwGamesMs: PAUSE_BETWEEN_GAMES_MS };
    }

    // Transition out of between-games pause when timer hits 0
    if (game.phase === 'pauseBetweenGames' && (game.tPauseBtwGamesMs ?? 0) <= 0) {
      currentGameIndex++;
      midSwapDoneThisGame = false;

      if (rules.match.switchEndsEachGame) {
        p1AtEastNow = !p1AtEastNow; // sides actually swap at game start
        events.swapSidesNow = true;
      }

      const nextInitialServer = rules.match.alternateInitialServerEachGame
        ? sideOpposite(initialServerThisGame)
        : initialServerThisGame;
      initialServerThisGame = nextInitialServer;

      // Fresh state with correct player occupancy for the new game
      const freshBase = createInitialState(game.bounds, nextInitialServer, p1AtEastNow);
      let fresh = addRulesToState(freshBase, rules);
      // Carry over any pre-armed serve angle configured during the pause window
      if (game.params.serveAngleDeg != null) {
        fresh = { ...fresh, params: { ...fresh.params, serveAngleDeg: game.params.serveAngleDeg } };
      }
      game = serveFrom(nextInitialServer, fresh);

      return { state: game, events };
    }

    // Game finished this frame?
    if (game.phase === 'gameOver' && game.gameWinner) {
      // Record immutable history once
      if (!gamesHistory.some((g) => g.gameIndex === currentGameIndex)) {
        // Record immutable history in PLAYER space (east row = P1, west row = P2)
        gamesHistory.push({
          gameIndex: currentGameIndex,
          east: game.pointsByPlayer.P1,
          west: game.pointsByPlayer.P2,
          winner: game.pointsByPlayer.P1 >= game.pointsByPlayer.P2 ? 'east' : 'west',
        });
      }

      // Keep old end-based counters for reference (not used to decide match)
      const winnerEnd = game.gameWinner as TableEnd; // narrow for strict index access
      gamesWonByEnd[winnerEnd] = (gamesWonByEnd[winnerEnd] ?? 0) + 1;

      // ✅ Player-centric win counting
      const winnerPlayer = endToPlayer(winnerEnd);
      gamesWonByPlayer[winnerPlayer] = (gamesWonByPlayer[winnerPlayer] ?? 0) + 1;

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
          p1Won ? (p1AtEastNow ? 'east' : 'west') : p1AtEastNow ? 'west' : 'east'
        ) as TableEnd;

        events.matchOver = { winner: matchWinner };
        game = {
          ...game,
          phase: 'matchOver',
          matchWinner,
          tMatchOverMs: PAUSE_MATCH_OVER_MS,
        };
        return { state: game, events };
      }

      // Otherwise: enter between-games pause
      const ms = game.tPauseBtwGamesMs ?? PAUSE_BETWEEN_GAMES_MS;
      game = { ...game, phase: 'pauseBetweenGames', tPauseBtwGamesMs: ms };
      return { state: game, events };
    }

    return { state: game, events };
  }

  return { getGame: () => game, getSnapshot: snapshot, afterPhysicsStep };
}
