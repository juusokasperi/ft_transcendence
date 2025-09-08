// src/app/modes/local.ts
import { createEngine } from "@client/engine/engine";
import { createLifecycle } from "@client/engine/lifecycle";
import { createWorld } from "@client/scene/scene";
import {
  attachLocalInput,
  readIntent,
  toggleControlsMirrored,
  blockInputFor,
} from "@client/input/aggregate";
import { createBounces } from "@client/visuals/bounce/bounces";
import { FXManager } from "@client/fx/manager";
import { createScoreboard } from "@client/ui/scoreboard";
import { updateHUD } from "@client/ui/hud-binding";
import { createPaddleAnimator } from "@client/visuals/animate-paddle";

import { computeBounds } from "@app/adapters/bounds";
import { detectEnteredServe, onEnteredServe } from "@app/adapters/serve-cue";
import { applyFrameEvents } from "@app/adapters/events-to-fx";
import {
  mapStateForPlayerRows,
  mapHistoryForPlayers,
} from "@app/adapters/hud-map";

import {
  type GameState,
  createInitialState,
  stepPaddles,
  handleSteps,
  serveFrom,
  createMatchController,
  tableTennisRules,
} from "@game";

import { pickInitialServer, SERVE_SELECT_TOTAL_MS } from "@shared";
import { deriveSeed32 } from "@shared/utils/random";
import { nextLocalMatchSeed } from "@app/seed";
import { disposeWorld } from "@app/teardown";

interface PongInstance {
  start(): void;
  destroy(): void;
}

export function createLocalApp(canvas: HTMLCanvasElement): PongInstance {
  canvas.tabIndex = 1;

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

  // Player display names (local defaults)
  const names = { east: "Magenta", west: "Green" } as const;

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
  const matchSeed = nextLocalMatchSeed(rulesetCrc, tableW, tableH);
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
      state = stepPaddles(state, readIntent(), dt);

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
      const historyForHUD = mapHistoryForPlayers(
        snap.gamesHistory,
        RULES.match.switchEndsEachGame,
      );
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


  const destroy = () =>
    disposeWorld({
      loop,
      world,                // owns the Scene; disposes it
      fx,
      hud,
      engineDisposable,
  });

  return {
    start() {
      // Pre-roll: run serve selection FX, gate input, then arm opening serve.
      void import("@client/fx/utils").then(({ incHide }) => {
        incHide(ball.mesh);
        incHide(ball.mesh);
      });

      blockInputFor(SERVE_SELECT_TOTAL_MS + 200);
      introUntil = performance.now() + SERVE_SELECT_TOTAL_MS;

      loop.start();

      void fx.serveSelection(initialServer).then(async () => {
        state = serveFrom(initialServer, state);
        state = { ...state, tPauseBtwPointsMs: 0 };

        const dir = initialServer === "east" ? -1 : 1;
        Bounces.scheduleServe(dir);

        const { decHide } = await import("@client/fx/utils");
        decHide(ball.mesh);
        decHide(ball.mesh);
      });
    },
    destroy,
  };
}
