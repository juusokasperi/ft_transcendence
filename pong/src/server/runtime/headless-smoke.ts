// Run with: pnpm smoke
// A tiny determinism harness for the headless core (no Babylon imports).

import {
  createInitialState,
  stepPaddles,
  handleSteps,
  serveFrom,
  createMatchController,
  tableTennisRules,
  type GameState,
} from "@game";
import { pickInitialServer, type MatchSeed, type InputIntent } from "@shared";

// --- Stable “standard” bounds (copied from visual proportions) ---
const StandardBounds: GameState["bounds"] = {
  halfLengthX: 1.1, // table half-length (x)
  halfWidthZ: 0.55, // table half-width (z)
  paddleHalfDepthZ: 0.12, // paddle half-size in Z for hit tests
  leftPaddleX: -0.95, // left plane center X
  rightPaddleX: 0.95, // right plane center X
  ballRadius: 0.06, // for collisions/hits
};

// Fixed rules matching your table-tennis preset defaults.
const RULES = tableTennisRules({
  match: {
    bestOf: 5,
    switchEndsEachGame: true,
    decidingGameMidSwapAtPoints: 5,
    alternateInitialServerEachGame: true,
  },
});

// Simple deterministic paddle control: track the ball when it's coming toward you.
function makeIntentFor(state: GameState): InputIntent {
  const zBall = state.ball.z;
  const zP1 = state.paddles.P1.z;
  const zP2 = state.paddles.P2.z;
  const sign = (x: number) => (x < 0 ? -1 : x > 0 ? 1 : 0);

  // If ball moving to the right (vx > 0), P2 should track; else P1 should track.
  const trackSpeed = 0.9; // “stick deflection” [-1..1]
  const dead = 0.015;

  const moveP1 = state.ball.vx < 0 ? sign(zBall - zP1) : 0;
  const moveP2 = state.ball.vx > 0 ? sign(zBall - zP2) : 0;

  return {
    leftAxis: Math.abs(zBall - zP1) > dead ? trackSpeed * moveP1 : 0,
    rightAxis: Math.abs(zBall - zP2) > dead ? trackSpeed * moveP2 : 0,
  };
}

type RunResult = {
  final: Omit<GameState, "params"> & { params: never }; // omit floats not needed here
  gamesHistory?: Array<{
    gameIndex: number;
    east: number;
    west: number;
    winner: "east" | "west";
  }>;
  bestOf: number;
  currentGameIndex: number;
};

function stripParams(s: GameState) {
  // params carry speeds/coeffs but we don't mutate them; keep output smaller.
  // If you want full dumps, return `s` directly.
  const { params: _params, ...rest } = s as any;
  return { ...rest, params: undefined as never };
}

function runOnce(seed: MatchSeed, seconds = 20): RunResult {
  const initialServer = pickInitialServer(seed);
  const match = createMatchController(StandardBounds, RULES, initialServer);

  let state = createInitialState(StandardBounds, initialServer);
  // start with a serve immediately (no intro FX on headless)
  state = serveFrom(initialServer, state);

  // fixed-step simulation (same cadence as your Lifecycle loop)
  const dt = 1 / 60;
  const steps = Math.floor(seconds / dt);

  for (let i = 0; i < steps; i++) {
    // 1) Input → paddles
    state = stepPaddles(state, makeIntentFor(state), dt);

    // 2) Physics/flow
    const stepped = handleSteps(state, dt);

    // 3) Match controller reacts to scoring / game flow (may swap sides, etc.)
    const mc = match.afterPhysicsStep(stepped.next);
    state = mc.state;

    // Optional early out: break once match is won.
    const snap = match.getSnapshot();
    const pToWin = Math.floor(snap.bestOf / 2) + 1;
    const w = snap.gamesHistory?.reduce(
      (acc, g) => ({ ...acc, [g.winner]: (acc as any)[g.winner] + 1 }),
      { east: 0, west: 0 } as Record<"east" | "west", number>,
    ) || { east: 0, west: 0 };
    if (w.east >= pToWin || w.west >= pToWin) break;
  }

  const snap = match.getSnapshot();
  return {
    final: stripParams(state),
    gamesHistory: snap.gamesHistory,
    bestOf: snap.bestOf,
    currentGameIndex: snap.currentGameIndex,
  };
}

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const seed: MatchSeed = 0xdead_beef >>> 0;

  const A = runOnce(seed, 20);
  const B = runOnce(seed, 20);

  const ok = deepEqual(A, B);
  if (!ok) {
    console.error("[Determinism] Mismatch between runs with the same seed.");
    console.error("A:", JSON.stringify(A, null, 2));
    console.error("B:", JSON.stringify(B, null, 2));
    process.exitCode = 1;
    return;
  }

  console.info("[Determinism] OK — identical results with same seed.");
  console.info(JSON.stringify(A, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
