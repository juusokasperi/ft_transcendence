// src/app/modes/local.ts
import { createEngine } from '@pong/render';
import { createLifecycle } from '@pong/render';
import { createWorld } from '@pong/render';
import { attachLocalInput, readIntent, toggleControlsMirrored, blockInputFor } from '@pong/render';
import { createBounces } from '@pong/render';
import { FXManager } from '@pong/render';
import { createScoreboard } from '@pong/render';
import { updateHUD } from '@pong/render';
import { createPaddleAnimator } from '@pong/render';

import { computeBounds } from '@pong/render';
import { detectEnteredServe, onEnteredServe } from '@pong/render';
import { applyFrameEvents } from '@pong/render';
import { mapStateForPlayerRows, mapHistoryForPlayers } from '@pong/render';

import {
  type GameState,
  createInitialState,
  stepPaddles,
  handleSteps,
  serveFrom,
  createMatchController,
  tableTennisRules,
} from '@pong/game-logic';

import { pickInitialServer, SERVE_SELECT_TOTAL_MS, randomSeed32 } from '@pong/shared';
import { deriveSeed32 } from '@pong/shared';
import { disposeWorld } from '@pong/render';
import type { Preferences } from './preferences';
import { applyPreferences } from './preferences';

interface PongInstance {
  start(): void;
  destroy(): void;
  updatePreferences(p: Preferences): void;
}

// moved to ./utils

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

  // Player display names (player-row pinned)
  let names: { east: string; west: string } = { east: 'Magenta', west: 'Green' };

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

  // Ruleset + match controller config
  const RULES = tableTennisRules({
    match: {
      bestOf: 5,
      switchEndsEachGame: true,
      decidingGameMidSwapAtPoints: 5,
      alternateInitialServerEachGame: true,
    },
  });

  // === Deterministic per-match seed (depends on rules + table size) ===
  const rulesetCrc = deriveSeed32(
    RULES.game.targetScore,
    RULES.game.winBy,
    RULES.game.servesPerTurn,
    RULES.game.deuceServesPerTurn,
    RULES.match.bestOf,
    RULES.match.switchEndsEachGame ? 1 : 0,
    RULES.match.decidingGameMidSwapAtPoints ?? 0,
    RULES.match.alternateInitialServerEachGame ? 1 : 0,
  );
  const tableW = bounds.halfLengthX * 2;
  const tableH = bounds.halfWidthZ * 2;
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

  // Headless state (boot aligned to chosen initial server)
  let state: GameState = createInitialState(bounds, initialServer);

  // Input
  const detachInput = attachLocalInput(canvas);
  scene.onDisposeObservable.add(detachInput);

  // Simple paddle-centering tween gate (kept in visuals)
  const paddleAnim = createPaddleAnimator(scene, left.mesh, right.mesh);

  // Track actual side swaps to know when the players have crossed (for HUD row mapping)
  let rowsMirrored = false;

  // Intro gate (wall-clock ms until which logic is gated)
  let introUntil = 0;

  // Fixed-step lifecycle (simulation cadence is set here)
  const loop = createLifecycle(engine, scene, {
    logicHz: 60,
    update: (dtMs) => {
      if (performance.now() < introUntil) return; // skip physics during intro FX
      const dt = Math.min(0.05, dtMs / 1000);

      // 1) Input → paddles
      const intent = readIntent();
      //console.log('[LocalGame] Intent:', intent, 'Before step:', state.paddles);
      state = stepPaddles(state, intent, dt);
      //console.log('[LocalGame] After step:', state.paddles);

      // 2) Physics/flow
      const prevPhase = state.phase;
      const stepped = handleSteps(state, dt);

      // 3) Match controller (scoring/game flow/swap sides)
      const mc = match.afterPhysicsStep(stepped.next);
      state = mc.state;

      if (mc.events.swapSidesNow) {
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

        // crossover cue
        paddleAnim.cue(180);
      }

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
      const historyForHUD = mapHistoryForPlayers(snap.gamesHistory, RULES.match.switchEndsEachGame);
      updateHUD(hud, stateForHUD, names, {
        bestOf: snap.bestOf,
        currentGameIndex: snap.currentGameIndex,
        gamesHistory: historyForHUD,
      });

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

  // Apply initial preferences if provided
  applyPreferences(preferences, {
    setNames: (n) => (names = n),
    leftMaterial: left.mesh.material,
    rightMaterial: right.mesh.material,
    rowsMirrored,
  });

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
      //canvas.focus();
      //console.log('[LocalGame] Canvas focused:', document.activeElement === canvas);
      /*       if (document.activeElement !== canvas) {
        console.warn('[LocalGame] Canvas is not focused. Keyboard controls will not work until you click inside the game area.');
      } */
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
    },
  };
}
