// src/app/modes/online.ts
import { createEngine } from "@client/engine/engine";
import { createLifecycle } from "@client/engine/lifecycle";
import { createWorld } from "@client/scene/scene";
import { FXManager } from "@client/fx/manager";
import { createScoreboard } from "@client/ui/scoreboard";
import { updateHUD } from "@client/ui/hud-binding";
import { applyFrameEvents } from "@app/adapters/events-to-fx";
import { computeBounds } from "@app/adapters/bounds";
import { detectEnteredServe, onEnteredServe } from "@app/adapters/serve-cue";
import { mapStateForPlayerRows } from "@app/adapters/hud-map";

import { readIntent } from "@client/input/aggregate";
import { blockInputFor } from "@client/input/block";
import { mixOnlineAxes, type PlayerSeat } from "@app/adapters/seat-router";
import { disposeWorld } from "@app/teardown";

import type { GameState } from "@game";
import type { FrameEvents } from "@shared";
import { SERVE_SELECT_TOTAL_MS } from "@shared";
import { clamp01 } from "@shared/utils/math";

// --- Net placeholders (wire your transport here) -----------------------------------
type OnlineClient = {
  mySeat: PlayerSeat; // "P1" | "P2"
  onSnapshot(cb: (s: GameState, ev: FrameEvents) => void): void;
  onOpponentAxis(cb: (axis: number) => void): void; // scalar [-1..1]
  sendLocalAxis(axis: number): void; // called every tick
  disconnect(): void;
};

// Resolve this with your WebSocket/RTC layer.
async function connectOnline(): Promise<OnlineClient> {
  throw new Error("connectOnline(): wire your transport here");
}

// ------------------------------------------------------------------------------------
interface PongInstance {
  start(): void;
  destroy(): void;
}

/**
 * Server-authoritative thin client:
 * - visuals/HUD locally
 * - input uplink (single axis)
 * - snapshots/events downlink
 * - optional interpolation (kept tiny here)
 */
export function createOnlineApp(canvas: HTMLCanvasElement): PongInstance {
  canvas.tabIndex = 1;

  // Engine/scene/world (identical to local)
  const { engine, engineDisposable } = createEngine(canvas);
  const world = createWorld(engine);
  const {
    scene,
    paddles: { left, right },
    table,
    ball,
  } = world;

  // HUD
  const hud = createScoreboard();
  hud.attachToCanvas(canvas);

  // Names (you'll likely get these from the lobby/room)
  const names = { east: "Magenta", west: "Green" } as const;

  // Render→headless bounds + FX
  const { bounds } = computeBounds(world);
  const fx = new FXManager(scene, {
    wallZNorth: +bounds.halfWidthZ,
    wallZSouth: -bounds.halfWidthZ,
    ballMesh: ball.mesh,
    ballRadius: bounds.ballRadius,
    tableTop: table.tableTop,
    camera: world.camera,
  });

  // --- Net state -------------------------------------------------------------------
  let net!: OnlineClient;
  let mySeat: PlayerSeat = "P1"; // set after connect()
  let oppAxis = 0; // last known opponent axis
  let latest: GameState | null = null; // latest server snapshot
  let lastEvents: FrameEvents = {}; // events paired with latest snapshot
  let prevPhase: GameState["phase"] | null = null;

  // Simple (optional) rows mirroring knob if you choose to flip per-game
  // NOTE: With server-authoritative flow, you can toggle this via messages.
  let rowsMirrored = false;

  // Interpolation cache (keep tiny: just ball X and paddle Z’s)
  let prevSnap: GameState | null = null;
  let prevT = 0,
    currT = 0; // ms timestamps for snapshots

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // --- Lifecycle (same cadence & structure as local) --------------------------------
  const loop = createLifecycle(engine, scene, {
    logicHz: 60,
    update: () => {
      // 1) Input: read a single local axis and uplink it
      //    (reuse the aggregator merge of keyboard+touch, but take my seat’s stick)
      const inpt = readIntent(); // merged, allocation-free
      const localAxis = mySeat === "P1" ? inpt.leftAxis : inpt.rightAxis;
      net?.sendLocalAxis(localAxis);

      // 2) Visuals from server snapshot (with tiny interpolation)
      const now = performance.now();
      const hasPrev = !!prevSnap && prevT < currT;
      const alpha = hasPrev
        ? clamp01((now - currT) / Math.max(1, currT - prevT))
        : 1;

      const snap = latest ?? prevSnap;
      if (snap) {
        // Interpolate a few hot fields; fall back to latest when no prev.
        const ref = prevSnap ?? snap;
        const ballX = hasPrev
          ? lerp(ref.ball.x, snap.ball.x, alpha)
          : snap.ball.x;
        const ballVX =
          ((snap.ball.x - ref.ball.x) / Math.max(1, currT - prevT)) * 1000;

        // Ball Y via the same visual bounce helper you use locally
        // (optional — you can also drive Y directly from server if you send it)
        const BOUNCE_Y = (() => {
          // ultra-tiny stateless parabola over X; or keep at table height
          return 0; // keep simple; or plug your existing createBounces if desired
        })();

        ball.mesh.position.set(
          ballX,
          BOUNCE_Y,
          hasPrev ? lerp(ref.ball.z, snap.ball.z, alpha) : snap.ball.z,
        );

        // Paddles (authoritative from server)
        left.mesh.position.z = hasPrev
          ? lerp(ref.paddles.P1.z, snap.paddles.P1.z, alpha)
          : snap.paddles.P1.z;
        right.mesh.position.z = hasPrev
          ? lerp(ref.paddles.P2.z, snap.paddles.P2.z, alpha)
          : snap.paddles.P2.z;

        // 3) HUD (player-pinned if you decide to mirror rows)
        const stateForHUD = mapStateForPlayerRows(snap, rowsMirrored);
        updateHUD(hud, stateForHUD, names /* optional match snapshot here */);
      }

      // 4) FX from last frame’s server events
      if (lastEvents) {
        const y = ball.mesh.position.y;
        applyFrameEvents(fx, lastEvents, y);
        // clear or keep — depends on how often server sends them; tiny shell: clear
        lastEvents = {};
      }
    },
  });

  // --- Connect on start; wire streams ------------------------------------------------
  async function start() {
    // Gate local input briefly to match your local intro FX pacing.
    blockInputFor(SERVE_SELECT_TOTAL_MS + 200);

    net = await connectOnline();
    mySeat = net.mySeat;

    net.onOpponentAxis((axis) => {
      oppAxis = axis;
      // Ready for client-side prediction later:
      // const intent = mixOnlineAxes(mySeat, lastLocalAxis, oppAxis);
      // (If you enable prediction: feed `intent` into stepPaddles for visuals.)
    });

    net.onSnapshot((s, ev) => {
      // Phase transition hook → serve cues
      if (prevPhase && s.phase !== prevPhase) {
        const entered = detectEnteredServe(prevPhase, s.phase);
        if (entered) {
          onEnteredServe(entered, {
            ballMesh: ball.mesh,
            // If you decide to use createBounces here, pass it; tiny shell omits for brevity.
            Bounces: {
              scheduleServe: () => {},
              update: () => 0,
              clear: () => {},
            } as any,
            paddleAnim: { cue: () => 0 },
            blockInputFor,
          });
        }
      }
      prevPhase = s.phase;

      // Snapshot ring for tiny interpolation
      prevSnap = latest ?? s;
      latest = s;
      prevT = currT;
      currT = performance.now() + 60; // small buffer; tune to your tick + net jitter

      // FX events piggybacked with this snapshot
      lastEvents = ev || {};
    });

    loop.start();
  }

  const destroy = () =>
    disposeWorld({
      loop,
      net,                  // disconnect safely
      world,                // disposes Scene and meshes
      fx,
      hud,
      engineDisposable,
    });

  return { start, destroy };
}
