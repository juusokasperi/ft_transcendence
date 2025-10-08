/**
 * Local game mode (render + headless loop in the browser).
 *
 * Responsibilities:
 * - Build Babylon world (scene, meshes, camera, lights)
 * - Drive a fixed‑timestep simulation and project state to meshes
 * - Create and coordinate HUD + FX (including serve cues and camera shake)
 * - Surface match/game transitions with short messages and brief pauses
 * - Keep visual colors in sync with user preferences and side swaps
 */
import { createEngine } from '@pong/render';
import { createLifecycle } from '@pong/render';
import { createWorld } from '@pong/render';
import {
  attachLocalInput,
  readIntent,
  setControlsMirrored,
  toggleControlsMirrored,
  blockInputFor,
  setBindingProfile,
} from '@pong/render';
import { createBounces } from '@pong/render';
import { FXManager } from '@pong/render';
import { createScoreboard } from '@pong/render';
import { updateHUD } from '@pong/render';
import { createPaddleAnimator } from '@pong/render';

import { computeBounds } from '@pong/render';
import { detectEnteredServe, onEnteredServe } from '@pong/render';
import { applyFrameEventsToFx } from '@pong/render';
import { mapStateForPlayerRows, mapHistoryForPlayers } from '@pong/render';

import {
  type GameState,
  stepPaddles,
  handleSteps,
  serveFrom,
  createMatchController,
  tableTennisRules,
  setServeAngleDeg,
} from '@pong/game-logic';

import { pickInitialServer, SERVE_SELECT_TOTAL_MS, randomSeed32, sideOpposite } from '@pong/shared';
import { disposeWorld } from '@pong/render';
import type { ControllerScheme, Preferences } from '../preferences';
import { applyPreferences, applyControllerBindingsFromPrefs } from '../preferences';
import { setHudAndPaletteColorsFromPrefs, pickSafeServeAngleDeg } from './utils';
import { runServeSelectionIntro } from '../shared/utils';
import { swapPaddleMaterials, handleMatchOver, handleSwapSidesNow } from '../shared/utils';
import { orbitCameraFor } from '@pong/render';
import { applyFrameEventsToAudio } from '@pong/render';
import { createLocalAudioKit, createLocalSfxDetectors } from '../shared/audio-utils';

// Controller bindings application moved to preferences.ts

/** Public surface returned by createLocalApp() */
interface PongInstance {
  start(): void;
  destroy(): void;
  updatePreferences(p: Preferences): void;
  observe(): {
    ball: { x: number; z: number; vx: number; vz: number };
    // Player-centric view kept for bot/tooling backwards compatibility
    paddles: { P1: { z: number }; P2: { z: number } };
    // End-centric view for clarity in UI/tooling
    paddlesByEnd: { east: { z: number }; west: { z: number } };
    bounds: {
      leftPaddleX: number;
      rightPaddleX: number;
      halfWidthZ: number;
      ballRadius: number;
    };
    params: { paddleSpeed: number; restitutionWall: number };
  };
}

/**
 * Bootstraps a complete local game on a given canvas element.
 * - preferences (optional) initialize colors, names, and rules overrides.
 */
export function createLocalApp(canvas: HTMLCanvasElement, preferences?: Preferences): PongInstance {
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
  // Volume UI will be attached after audio bus is created

  // Tracks whether players have crossed sides (affects HUD row mapping & palette)
  let rowsMirrored = false;

  // Player display names (always row‑pinned: east → top, west → bottom)
  let names: { east: string; west: string } = { east: ' ', west: ' ' };

  // Apply initial preferences if provided
  applyPreferences(preferences, {
    setNames: (n) => (names = n),
    leftMaterial: left.mesh.material,
    rightMaterial: right.mesh.material,
    rowsMirrored,
  });
  if (preferences) setHudAndPaletteColorsFromPrefs(hud, preferences, rowsMirrored);

  // Render→headless bounds (read once after scene is built)
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

  // Headless rules (allow overrides from preferences)
  const RULES = tableTennisRules(preferences?.rules);

  const matchSeed = randomSeed32();
  const initialServer = pickInitialServer(matchSeed);

  // Visual bounce helper — seeded per match (deterministic variety; visual‑only)
  const Bounces = createBounces(
    ball.mesh,
    table.tableTop.position.y,
    bounds.ballRadius,
    bounds.halfLengthX,
    left.mesh,
    right.mesh,
    matchSeed,
  );

  // Match controller (authoritative game flow/state transitions)
  const match = createMatchController(bounds, RULES, initialServer);

  // Headless state aligned to match controller (ensures rules overrides apply from game 1)
  let state: GameState = match.getGame();
  // Deterministic per-serve variation counter for safe serve angles
  let serveIndex = 0;
  // Track expected initial server per game (mirror of match controller policy)
  let initialServerThisGameLocal = initialServer;

  // Input wiring (keyboard/touch aggregator)
  setBindingProfile('local');
  applyControllerBindingsFromPrefs(preferences);
  const detachInput = attachLocalInput(canvas);
  scene.onDisposeObservable.add(detachInput);
  // Ensure new matches always start with canonical control orientation
  setControlsMirrored(false);

  // Simple paddle‑centering tween gate (kept in visuals)
  const paddleAnim = createPaddleAnimator(scene, left.mesh, right.mesh);

  // ── Audio helpers (bus/manager/UI + SFX detectors) ─────────────────────
  const audioKit = createLocalAudioKit(scene, canvas);
  const audioBus = audioKit.bus;
  const BASE_Y_FOR_AUDIO = table.tableTop.position.y + bounds.ballRadius / 2;
  const sfxDetectors = createLocalSfxDetectors(audioBus, BASE_Y_FOR_AUDIO);

  // Intro gate (wall‑clock ms) to postpone physics during intro FX
  let introUntil = 0;
  // Mid‑game pause gate (used for decisive mid‑swap and between‑games message)
  let pauseUntil = 0;

  // HUD diff cache (avoid redundant DOM updates for match boxes)
  let lastBestOf = 0;
  let lastCurrentGameIndex = 0;
  let lastHistoryRef: ReturnType<typeof mapHistoryForPlayers> | null = null;

  // Fixed‑step lifecycle (simulation cadence is set here)
  const loop = createLifecycle(engine, scene, {
    logicHz: 60,
    update: (dtMs) => {
      const now = performance.now();
      // Gate physics during intro FX or scheduled pauses (HUD messages)
      if (now < introUntil || now < pauseUntil) return;
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

      // Match conclusion: message + host event (fired once per match)
      if (mc.events.matchOver) {
        const { winner } = mc.events.matchOver;
        handleMatchOver(hud, names, winner, () => match.getSnapshot(), canvas);
        // Stop match playlist when match concludes
        audioKit.stop();
      }

      if (mc.events.swapSidesNow) {
        // Show appropriate swap message and briefly pause gameplay
        const until = handleSwapSidesNow(
          hud,
          prevPhase,
          () => match.getSnapshot(),
          names,
          blockInputFor,
        );
        pauseUntil = Math.max(pauseUntil, until);
        // Spin camera during the pause window (full 360° at constant distance)
        const spinMs = Math.max(0, until - now);
        if (spinMs > 0) {
          orbitCameraFor(world.camera, spinMs, {
            onHalf: () => {
              // Controls follow player identity
              toggleControlsMirrored();
              // Colors/skins follow players across sides
              swapPaddleMaterials(left.mesh, right.mesh);
              // Update HUD row mapping parity
              rowsMirrored = !rowsMirrored;
              // Re‑apply preferences so player colors continue to follow players
              applyPreferences(preferences, {
                setNames: (n) => (names = n),
                leftMaterial: left.mesh.material,
                rightMaterial: right.mesh.material,
                rowsMirrored,
              });
              if (preferences) setHudAndPaletteColorsFromPrefs(hud, preferences, rowsMirrored);
              // Small crossover cue right after the swap
              paddleAnim.cue(180);
            },
          });
          if (preferences) setHudAndPaletteColorsFromPrefs(hud, preferences, rowsMirrored);
          paddleAnim.cue(180);
        }
      }

      // 4) Entered serve? Trigger visual serve cues
      const entered = detectEnteredServe(prevPhase, state.phase);
      if (entered) {
        onEnteredServe(entered, {
          ballMesh: ball.mesh,
          Bounces,
          paddleAnim,
          blockInputFor,
        });
      }

      // Prepare next serve angle as soon as we enter the short pause
      if (prevPhase !== 'pauseBtwPoints' && state.phase === 'pauseBtwPoints') {
        const side = state.nextServe ?? state.server;
        const deg = pickSafeServeAngleDeg(matchSeed, bounds, side, serveIndex++);
        state = setServeAngleDeg(state, deg);
      }

      // Between-games: pre-arm the next game's initial serve angle during the pause
      if (prevPhase !== 'pauseBetweenGames' && state.phase === 'pauseBetweenGames') {
        if (RULES.match.alternateInitialServerEachGame) {
          initialServerThisGameLocal = sideOpposite(initialServerThisGameLocal);
        }
        const degGame = pickSafeServeAngleDeg(
          matchSeed,
          bounds,
          initialServerThisGameLocal,
          serveIndex++,
        );
        state = setServeAngleDeg(state, degGame);
      }

      // 5) HUD (player‑pinned)
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
        left.mesh.position.z = state.paddles.east.z;
        right.mesh.position.z = state.paddles.west.z;
      }

      // Local-only SFX cues derived from visuals
      sfxDetectors.update(ballY);

      // 7) FX from headless events
      applyFrameEventsToFx(fx, stepped.events, ballY);
      // Audio SFX from events (keeps logic pure)
      applyFrameEventsToAudio(audioBus, stepped.events);
    },
  });

  // One‑stop teardown for all owned resources
  const destroy = () => {
    // Reset mirrored controls so subsequent matches inherit the default layout
    setControlsMirrored(false);
    try {
      audioKit.dispose();
    } catch {}
    disposeWorld({
      loop,
      world, // owns the Scene; disposes it
      fx,
      hud,
      engineDisposable,
    });
  };

  return {
    start() {
      // Audio boot: resume + preload SFX + start playlist
      void audioKit.start();
      // Pre‑roll: run serve selection FX, gate input, then arm opening serve

      blockInputFor(SERVE_SELECT_TOTAL_MS + 200);
      introUntil = performance.now() + SERVE_SELECT_TOTAL_MS;

      loop.start();

      void runServeSelectionIntro(fx, ball.mesh, initialServer, (dir) =>
        Bounces.scheduleServe(dir),
      ).then(async () => {
        // Set deterministic safe serve angle for the opening serve
        const serveDeg = pickSafeServeAngleDeg(matchSeed, bounds, initialServer, serveIndex++);
        state = setServeAngleDeg(state, serveDeg);

        state = serveFrom(initialServer, state);
        state = { ...state, tPauseBtwPointsMs: 0 };

        // bounce schedule handled by runServeSelectionIntro
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
      applyControllerBindingsFromPrefs(preferences);
      if (preferences) setHudAndPaletteColorsFromPrefs(hud, preferences, rowsMirrored);
    },
    observe() {
      // Provide a minimal, read‑only snapshot for AI planning (1 Hz sensor)
      return {
        ball: { x: state.ball.x, z: state.ball.z, vx: state.ball.vx, vz: state.ball.vz },
        paddles: { P1: { z: state.paddles.east.z }, P2: { z: state.paddles.west.z } },
        paddlesByEnd: { east: { z: state.paddles.east.z }, west: { z: state.paddles.west.z } },
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
        // Mirror parity matches control mirroring across swaps
        controlsMirrored: rowsMirrored,
      };
    },
  };
}
