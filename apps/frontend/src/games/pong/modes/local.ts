// src/app/modes/local.ts
import { createEngine } from '@pong/render';
import { createLifecycle } from '@pong/render';
import { createWorld } from '@pong/render';
import { attachLocalInput, readIntent, toggleControlsMirrored, blockInputFor } from '@pong/render';
import { setBindingProfile } from '@pong/render';
import { createBounces } from '@pong/render';
import { FXManager } from '@pong/render';
import { createScoreboard } from '@pong/render';
import { updateHUD } from '@pong/render';
import { createPaddleAnimator } from '@pong/render';

import { computeBounds } from '@pong/render';
import { detectEnteredServe, onEnteredServe } from '@pong/render';
import { applyFrameEvents } from '@pong/render';
import { mapStateForPlayerRows, mapHistoryForPlayers } from '@pong/render';
import { setPaddleColors } from '@pong/render';

import {
  type GameState,
  stepPaddles,
  handleSteps,
  serveFrom,
  createMatchController,
  tableTennisRules,
} from '@pong/game-logic';

import { pickInitialServer, SERVE_SELECT_TOTAL_MS, randomSeed32 } from '@pong/shared';
import { disposeWorld } from '@pong/render';
import type { Preferences } from './preferences';
import { applyPreferences, hexToRgb, rgb01ToCss } from './preferences';

interface PongInstance {
  start(): void;
  destroy(): void;
  updatePreferences(p: Preferences): void;
  /** Read-only snapshot for AI planning (1 Hz sensor). */
  observe(): {
    ball: { x: number; z: number; vx: number; vz: number };
    paddles: { P1: { z: number }; P2: { z: number } };
    bounds: {
      leftPaddleX: number;
      rightPaddleX: number;
      halfWidthZ: number;
      ballRadius: number;
    };
    params: { paddleSpeed: number; restitutionWall: number };
  };
}

export function createLocalApp(canvas: HTMLCanvasElement, preferences?: Preferences): PongInstance {
  // Engine/scene/world
  const { engine, engineDisposable } = createEngine(canvas);
  const world = createWorld(engine);
  const {
    scene,
    paddles: { left, right },
    table,
    ball,
  } = world;

  // HUD (DOM overlay anchored to canvas)
  const hud = createScoreboard();
  hud.attachToCanvas(canvas);

  // Track actual side swaps to know when the players have crossed (for HUD row mapping)
  let rowsMirrored = false;

  // Player display names (player-row pinned)
  let names: { east: string; west: string } = { east: ' ', west: ' ' };

  // Apply initial preferences if provided
  applyPreferences(preferences, {
    setNames: (n) => (names = n),
    leftMaterial: left.mesh.material,
    rightMaterial: right.mesh.material,
    rowsMirrored,
  });

  // Match HUD name colors to player/paddle colors (preferences-driven)
  if (preferences) {
    const c1 = hexToRgb(preferences.player1.paddleColor);
    const c2 = hexToRgb(preferences.player2.paddleColor);
    if (c1 && c2) hud.setPlayerNameColors(rgb01ToCss(c1), rgb01ToCss(c2));
  }

  // Keep global palette in sync for FX (e.g., serve selection) that read Colors.
  // Compute effective left/right tints based on current side mapping.
  if (preferences) {
    const c1 = hexToRgb(preferences.player1.paddleColor);
    const c2 = hexToRgb(preferences.player2.paddleColor);
    if (c1 && c2) {
      const leftRGB = rowsMirrored ? c2 : c1;
      const rightRGB = rowsMirrored ? c1 : c2;
      setPaddleColors(leftRGB, rightRGB);
    }
  }

  // Bounds once (render → headless)
  const { bounds } = computeBounds(world);

  // FX manager
  const fx = new FXManager(scene, {
    wallZNorth: +bounds.halfWidthZ,
    wallZSouth: -bounds.halfWidthZ,
    ballMesh: ball.mesh,
    ballRadius: bounds.ballRadius,
    tableTop: table.tableTop,
    camera: world.camera,
  });

  // Ruleset + match controller config (allow overrides from preferences)
  const RULES = tableTennisRules(preferences?.rules);

  const matchSeed = randomSeed32();
  const initialServer = pickInitialServer(matchSeed);

  // Visual bounce helper — seeded per match (deterministic variety; visual-only)
  const Bounces = createBounces(
    ball.mesh,
    table.tableTop.position.y,
    bounds.ballRadius,
    bounds.halfLengthX,
    left.mesh,
    right.mesh,
    matchSeed,
  );

  // Match controller
  const match = createMatchController(bounds, RULES, initialServer);

  // Headless state aligned to match controller (ensures rules overrides apply from game 1)
  let state: GameState = match.getGame();

  // Input
  setBindingProfile('local');
  const detachInput = attachLocalInput(canvas);
  scene.onDisposeObservable.add(detachInput);

  // Simple paddle-centering tween gate (kept in visuals)
  const paddleAnim = createPaddleAnimator(scene, left.mesh, right.mesh);

  // Intro gate (wall-clock ms until which logic is gated)
  let introUntil = 0;
  // Mid-game pause gate (e.g., decisive mid-swap message)
  let pauseUntil = 0;

  // HUD diff cache for match boxes
  let lastBestOf = 0;
  let lastCurrentGameIndex = 0;
  let lastHistoryRef: ReturnType<typeof mapHistoryForPlayers> | null = null;

  // Fixed-step lifecycle (simulation cadence is set here)
  const loop = createLifecycle(engine, scene, {
    logicHz: 60,
    update: (dtMs) => {
      const now = performance.now();
      if (now < introUntil || now < pauseUntil) return; // skip physics during intro FX or HUD pauses
      const dt = Math.min(0.05, dtMs / 1000);

      // 1) Input → paddles
      const intent = readIntent();
      state = stepPaddles(state, intent, dt);

      // 2) Physics/flow
      const prevPhase = state.phase;
      const stepped = handleSteps(state, dt);

      // 3) Match controller (scoring/game flow/swap sides)
      const mc = match.afterPhysicsStep(stepped.next);
      state = mc.state;

      // Emit lightweight DOM event so host UI can react without tight coupling.
      // Fires exactly once per match.
      if (mc.events.matchOver) {
        const { winner } = mc.events.matchOver;
        hud.flashMessage(`${names[winner]} won, impressive match!`, 3800);
        const snap = match.getSnapshot();
        const historyForHUD = mapHistoryForPlayers(snap.gamesHistory);
        canvas.dispatchEvent(
          new CustomEvent('pong:matchOver', {
            detail: {
              winner,
              bestOf: snap.bestOf,
              gamesHistory: historyForHUD,
              names,
            },
          }),
        );
      }

      if (mc.events.swapSidesNow) {
        const midGameSwap = prevPhase === 'rally';
        if (midGameSwap) {
          const ms = 3200;
          hud.flashMessage('Swapping mid-game for decisive game', ms);
          pauseUntil = Math.max(pauseUntil, performance.now() + ms);
          blockInputFor(ms);
        } else {
          // Use the last finished game's winner from snapshot history (player-pinned)
          const snapNow = match.getSnapshot();
          const hist = snapNow.gamesHistory || [];
          const last = hist[hist.length - 1];
          if (last?.winner) {
            const winnerRow = last.winner as 'east' | 'west';
            const ms = 3200;
            hud.flashMessage(`${names[winnerRow]} won the game, swapping side!`, ms);
            pauseUntil = Math.max(pauseUntil, performance.now() + ms);
            blockInputFor(ms);
          }
        }
        // controls follow player
        toggleControlsMirrored();

        // color/skin follows player
        const m = left.mesh.material;
        left.mesh.material = right.mesh.material;
        right.mesh.material = m;

        // HUD mapping parity
        rowsMirrored = !rowsMirrored;

        // Re-apply preferences so player colors continue to follow players
        applyPreferences(preferences, {
          setNames: (n) => (names = n),
          leftMaterial: left.mesh.material,
          rightMaterial: right.mesh.material,
          rowsMirrored,
        });

        // Update palette too, so future FX created after swaps stay accurate
        if (preferences) {
          const c1 = hexToRgb(preferences.player1.paddleColor);
          const c2 = hexToRgb(preferences.player2.paddleColor);
          if (c1 && c2) {
            const leftRGB = rowsMirrored ? c2 : c1;
            const rightRGB = rowsMirrored ? c1 : c2;
            setPaddleColors(leftRGB, rightRGB);
            // Keep HUD name colors in sync with player colors
            hud.setPlayerNameColors(rgb01ToCss(c1), rgb01ToCss(c2));
          }
        }

        // crossover cue
        paddleAnim.cue(180);
      }
      // gameOver handled via snapshot history for messaging; no latch required here

      // 4) Entered serve? Trigger cues
      const entered = detectEnteredServe(prevPhase, state.phase);
      if (entered) {
        onEnteredServe(entered, {
          ballMesh: ball.mesh,
          Bounces,
          paddleAnim,
          blockInputFor,
        });
      }

      // 5) HUD (player-pinned)
      const snap = match.getSnapshot();
      const stateForHUD = mapStateForPlayerRows(state, rowsMirrored);
      const historyForHUD = mapHistoryForPlayers(snap.gamesHistory);
      const changed =
        snap.bestOf !== lastBestOf ||
        snap.currentGameIndex !== lastCurrentGameIndex ||
        historyForHUD !== lastHistoryRef;

      updateHUD(
        hud,
        stateForHUD,
        names,
        changed
          ? {
              bestOf: snap.bestOf,
              currentGameIndex: snap.currentGameIndex,
              gamesHistory: historyForHUD,
            }
          : undefined,
      );

      if (changed) {
        lastBestOf = snap.bestOf;
        lastCurrentGameIndex = snap.currentGameIndex;
        lastHistoryRef = historyForHUD;
      }

      // 6) Visual bounce Y + project meshes
      const ballY = Bounces.update(state.ball.x, state.ball.vx);
      ball.mesh.position.set(state.ball.x, ballY, state.ball.z);
      if (!paddleAnim.isAnimating()) {
        left.mesh.position.z = state.paddles.P1.z;
        right.mesh.position.z = state.paddles.P2.z;
      }

      // 7) FX from events
      applyFrameEvents(fx, stepped.events, ballY);
    },
  });
  //console.log('[LocalGame] Lifecycle created:', loop);

  const destroy = () => {
    //console.log('[LocalGame] Destroy called');
    disposeWorld({
      loop,
      world, // owns the Scene; disposes it
      fx,
      hud,
      engineDisposable,
    });
    //console.log('[LocalGame] World disposed');
  };

  return {
    start() {
      //console.log('[LocalGame] start() called');
      // Pre-roll: run serve selection FX, gate input, then arm opening serve.
      void import('@pong/render').then(({ incHide }) => {
        incHide(ball.mesh);
        incHide(ball.mesh);
      });

      blockInputFor(SERVE_SELECT_TOTAL_MS + 200);
      introUntil = performance.now() + SERVE_SELECT_TOTAL_MS;

      loop.start();

      void fx.serveSelection(initialServer).then(async () => {
        state = serveFrom(initialServer, state);
        state = { ...state, tPauseBtwPointsMs: 0 };

        const dir = initialServer === 'east' ? -1 : 1;
        Bounces.scheduleServe(dir);

        const { decHide } = await import('@pong/render');
        decHide(ball.mesh);
        decHide(ball.mesh);
      });
    },
    destroy,
    updatePreferences(p: Preferences) {
      preferences = p;
      applyPreferences(p, {
        setNames: (n) => (names = n),
        leftMaterial: left.mesh.material,
        rightMaterial: right.mesh.material,
        rowsMirrored,
      });
      // Update HUD name colors to match updated player colors
      const c1 = hexToRgb(p.player1.paddleColor);
      const c2 = hexToRgb(p.player2.paddleColor);
      if (c1 && c2) hud.setPlayerNameColors(rgb01ToCss(c1), rgb01ToCss(c2));
    },
    observe() {
      // Provide a minimal, read-only snapshot for AI planning.
      return {
        ball: { x: state.ball.x, z: state.ball.z, vx: state.ball.vx, vz: state.ball.vz },
        paddles: { P1: { z: state.paddles.P1.z }, P2: { z: state.paddles.P2.z } },
        bounds: {
          leftPaddleX: state.bounds.leftPaddleX,
          rightPaddleX: state.bounds.rightPaddleX,
          halfWidthZ: state.bounds.halfWidthZ,
          ballRadius: state.bounds.ballRadius,
        },
        params: {
          paddleSpeed: state.params.paddleSpeed,
          restitutionWall: state.params.restitutionWall,
        },
      };
    },
  };
}
