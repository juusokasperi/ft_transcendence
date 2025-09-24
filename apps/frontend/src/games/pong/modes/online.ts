// src/app/modes/online.ts
import { createEngine } from '@pong/render';
import { createLifecycle } from '@pong/render';
import { createWorld } from '@pong/render';
import { FXManager } from '@pong/render';
import { createScoreboard } from '@pong/render';
import { updateHUD } from '@pong/render';
import { applyFrameEvents } from '@pong/render';
import { computeBounds } from '@pong/render';
import { detectEnteredServe, onEnteredServe } from '@pong/render';
import { mapStateForPlayerRows } from '@pong/render';
import { attachLocalInput } from '@pong/render';
import { setBindingProfile } from '@pong/render';
import { createBounces } from '@pong/render';
import { createPaddleAnimator } from '@pong/render';
import { toggleControlsMirrored } from '@pong/render';
import { incHide, decHide } from '@pong/render';

import { readIntent } from '@pong/render';
import { blockInputFor } from '@pong/render';
import { /* mixOnlineAxes, */ type PlayerSeat } from '@pong/render';
import { disposeWorld } from '@pong/render';

import type { GameState } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import { SERVE_SELECT_TOTAL_MS } from '@pong/shared';
import { rgb01ToCss } from './preferences';
import { clamp01 } from '@pong/shared';

import { wsUrl } from '../../../utils/url';

// --- Net placeholders (wire your transport here) -----------------------------------
type OnlineClient = {
  mySeat: PlayerSeat; // "P1" | "P2"
  onSnapshot(cb: (s: GameState, ev: FrameEvents, match?: MatchSnapshot) => void): void;
  onOpponentAxis(cb: (axis: number) => void): void; // scalar [-1..1]
  sendLocalAxis(axis: number): void; // called every tick
  disconnect(): void;
};

// Resolve this with your WebSocket/RTC layer.
async function connectOnline(cfg: {
  serverUrl: string;
  matchId: string;
  seat: PlayerSeat;
}): Promise<OnlineClient> {
  const { serverUrl, matchId, seat } = cfg;
  console.log('[OnlineGame] Connecting to server:', serverUrl, 'matchId:', matchId, 'seat:', seat);
  const gameWs = new WebSocket(wsUrl(`/game-server/${matchId}?seat=${seat}`));

  return await new Promise<OnlineClient>((resolve, reject) => {
    gameWs.addEventListener('error', (err) => {
      console.error('[OnlineGame] WebSocket error:', err);
      reject(err);
    });

    gameWs.addEventListener('open', () => {
      console.log('[OnlineGame] WebSocket connection opened');
      const snapshotListeners = new Set<
        (s: GameState, ev: FrameEvents, m?: MatchSnapshot) => void
      >();
      const opponentAxisListeners = new Set<(axis: number) => void>();

      gameWs.addEventListener('message', (ev) => {
        const data = JSON.parse(ev.data as string) as any;
        //console.log('[OnlineGame] Received message:', data);
        switch (data.type) {
          case 'snapshot':
            snapshotListeners.forEach((cb) => cb(data.state, data.events, data.match));
            break;
          case 'opponentAxis':
            opponentAxisListeners.forEach((cb) => cb(data.axis));
            break;
          default:
            console.warn('[OnlineGame] Unknown message type:', data.type);
            break;
        }
      });

      const client: OnlineClient = {
        mySeat: seat,
        onSnapshot(cb) {
          snapshotListeners.add(cb);
        },
        onOpponentAxis(cb) {
          opponentAxisListeners.add(cb);
        },
        sendLocalAxis(axis: number) {
          if (gameWs.readyState === WebSocket.OPEN) {
            //console.log('[OnlineGame] Sending axis:', axis);
            gameWs.send(JSON.stringify({ type: 'axis', axis }));
          }
        },
        disconnect() {
          console.log('[OnlineGame] Disconnecting WebSocket');
          gameWs.close();
        },
      };

      resolve(client);
    });
  });
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
export function createOnlineApp(
  canvas: HTMLCanvasElement,
  cfg: { serverUrl: string; matchId: string; seat: PlayerSeat },
): PongInstance {
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

  // Input
  setBindingProfile('online');
  const detachInput = attachLocalInput(canvas);
  scene.onDisposeObservable.add(detachInput);

  // Names (you'll likely get these from the lobby/room)
  const names = { east: 'Magenta', west: 'Green' } as const;

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

  // Helper: derive CSS color from a paddle mesh's material tint
  const matColorCss = (mat: any): string => {
    const c = mat?.subSurface?.tintColor ?? mat?.diffuseColor ?? mat?.albedoColor;
    return rgb01ToCss({ r: c?.r ?? 1, g: c?.g ?? 1, b: c?.b ?? 1 });
  };
  const syncHudNameColors = () => {
    const leftMat: any = left.mesh.material as any;
    const rightMat: any = right.mesh.material as any;
    // Top row = east; east starts on right side by convention
    const eastCss = matColorCss(rightMat);
    const westCss = matColorCss(leftMat);
    hud.setPlayerNameColors(eastCss, westCss);
  };
  syncHudNameColors();

  // Visual bounce helper — deterministic per match (visual-only)
  function hash32(s: string): number {
    // FNV-1a 32-bit hash (deterministic enough for seed)
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  const matchSeed = hash32(cfg.matchId);
  const Bounces = createBounces(
    ball.mesh,
    table.tableTop.position.y,
    bounds.ballRadius,
    bounds.halfLengthX,
    left.mesh,
    right.mesh,
    matchSeed,
  );

  // Paddle centering tween for serve cues and swaps
  const paddleAnim = createPaddleAnimator(scene, left.mesh, right.mesh);

  // Local render clamp to match table and paddle geometry
  const paddleMaxZ = bounds.halfWidthZ - bounds.paddleHalfDepthZ;
  const clampPaddleZ = (z: number) => Math.max(-paddleMaxZ, Math.min(paddleMaxZ, z));

  // --- Net state -------------------------------------------------------------------
  let net!: OnlineClient;
  let mySeat: PlayerSeat = 'P1'; // set after connect()
  let oppAxis = 0; // last known opponent axis
  let latest: GameState | null = null; // latest server snapshot
  const eventQueue: FrameEvents[] = []; // buffer to avoid dropping events between frames
  let prevPhase: GameState['phase'] | null = null;
  let didBootFX = false;
  let didFireMatchOverEvent = false;
  let latestMatch: MatchSnapshot | undefined;

  // Simple (optional) rows mirroring knob if you choose to flip per-game
  // NOTE: With server-authoritative flow, you can toggle this via messages.
  let rowsMirrored = false;

  // Interpolation cache (keep tiny: just ball X and paddle Z’s)
  let prevSnap: GameState | null = null;
  let prevT = 0,
    currT = 0; // ms timestamps for snapshots
  // HUD snapshot cache (from server)

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // --- Lifecycle (same cadence & structure as local) --------------------------------
  const loop = createLifecycle(engine, scene, {
    logicHz: 60,
    update: () => {
      // 1) Input: read a single local axis and uplink it
      //    (reuse the aggregator merge of keyboard+touch, but take my seat’s stick)
      const inpt = readIntent(); // merged, allocation-free
      const localAxis = mySeat === 'P1' ? inpt.leftAxis : inpt.rightAxis;
      net?.sendLocalAxis(localAxis);

      // 2) Visuals from server snapshot (with tiny interpolation)
      const now = performance.now();
      const hasPrev = !!prevSnap && prevT < currT;
      const alpha = hasPrev ? clamp01((now - currT) / Math.max(1, currT - prevT)) : 1;

      const snap = latest ?? prevSnap;
      if (snap) {
        // Interpolate a few hot fields; fall back to latest when no prev.
        const ref = prevSnap ?? snap;
        const ballX = hasPrev ? lerp(ref.ball.x, snap.ball.x, alpha) : snap.ball.x;
        const ballVX = ((snap.ball.x - ref.ball.x) / Math.max(1, currT - prevT)) * 1000;

        // Ball Y via the same visual bounce helper used locally
        const ballY = Bounces.update(ballX, ballVX);

        ball.mesh.position.set(
          ballX,
          ballY,
          hasPrev ? lerp(ref.ball.z, snap.ball.z, alpha) : snap.ball.z,
        );

        // Paddles (authoritative from server) — clamp to local render bounds
        if (!paddleAnim.isAnimating()) {
          const p1z = hasPrev
            ? lerp(ref.paddles.P1.z, snap.paddles.P1.z, alpha)
            : snap.paddles.P1.z;
          const p2z = hasPrev
            ? lerp(ref.paddles.P2.z, snap.paddles.P2.z, alpha)
            : snap.paddles.P2.z;
          left.mesh.position.z = clampPaddleZ(p1z);
          right.mesh.position.z = clampPaddleZ(p2z);
        }

        // 3) HUD (player-pinned)
        const stateForHUD = mapStateForPlayerRows(snap, rowsMirrored);
        updateHUD(hud, stateForHUD, names, latestMatch);
      }

      // 4) Drain FX events queued from snapshots (avoid dropping on mismatch rates)
      if (eventQueue.length) {
        const y = ball.mesh.position.y;
        // apply all pending events this frame (they are cheap)
        while (eventQueue.length) {
          const ev = eventQueue.shift();
          if (ev) applyFrameEvents(fx, ev, y);
        }
      }
    },
  });

  // --- Connect on start; wire streams ------------------------------------------------
  async function start() {
    console.log('[OnlineGame] Starting online game with config:', cfg);
    blockInputFor(SERVE_SELECT_TOTAL_MS + 200);

    net = await connectOnline(cfg);
    mySeat = net.mySeat;
    console.log('[OnlineGame] Connected. My seat:', mySeat);

    net.onOpponentAxis((axis) => {
      oppAxis = axis;
      //console.log('[OnlineGame] Received opponent axis:', axis);
    });

    net.onSnapshot((s, ev, matchSnap) => {
      //console.log('[OnlineGame] Received snapshot. Phase:', s.phase);
      if (!didBootFX) {
        didBootFX = true;
        incHide(ball.mesh);
        incHide(ball.mesh);
        // Schedule initial visual serve bounce based on current server
        const dir = s.server === 'east' ? -1 : 1;
        Bounces.scheduleServe(dir);
        void fx.serveSelection(s.server).then(() => {
          decHide(ball.mesh);
          decHide(ball.mesh);
        });
      }
      // Phase transition hook → serve cues
      if (prevPhase && s.phase !== prevPhase) {
        const entered = detectEnteredServe(prevPhase, s.phase);
        if (entered) {
          onEnteredServe(entered, {
            ballMesh: ball.mesh,
            Bounces,
            paddleAnim,
            blockInputFor,
          });
        }
      }
      prevPhase = s.phase;
      latestMatch = matchSnap ?? latestMatch;

      // Respond to server signaled side swaps (if present in events)
      const anyEv = ev as any;
      if (anyEv && anyEv.swapSidesNow) {
        // Mirror HUD rows for readability and play a small crossover cue.
        rowsMirrored = !rowsMirrored;
        // Swap paddle materials so colors/skins follow players across sides.
        const m = left.mesh.material;
        left.mesh.material = right.mesh.material;
        right.mesh.material = m;
        // Names follow player colors across swaps
        syncHudNameColors();
        paddleAnim.cue(180);
      }

      // Fire a DOM event once when the match concludes (parity with local mode)
      if (!didFireMatchOverEvent && anyEv && anyEv.matchOver) {
        didFireMatchOverEvent = true;
        const winner = anyEv.matchOver.winner as 'east' | 'west';
        canvas.dispatchEvent(
          new CustomEvent('pong:matchOver', {
            detail: {
              winner,
              bestOf: latestMatch?.bestOf ?? s.params.bestOf,
              gamesHistory: latestMatch?.gamesHistory ?? [],
              names,
            },
          }),
        );
      }

      // Snapshot ring for tiny interpolation
      prevSnap = latest ?? s;
      latest = s;
      prevT = currT;
      currT = performance.now() + 60; // small buffer; tune to your tick + net jitter

      // Queue FX events from this snapshot; avoid overwriting if multiple snapshots arrive
      if (ev && (ev.wallHit || ev.explode)) {
        // cap queue size to prevent unbounded growth under extreme lag
        if (eventQueue.length > 8) eventQueue.splice(0, eventQueue.length - 8);
        eventQueue.push(ev);
      }
    });

    loop.start();
    console.log('[OnlineGame] Game loop started');
  }

  const destroy = () => {
    console.log('[OnlineGame] Destroying online game');
    disposeWorld({
      loop,
      net,
      world,
      fx,
      hud,
      engineDisposable,
    });
  };

  return { start, destroy };
}
