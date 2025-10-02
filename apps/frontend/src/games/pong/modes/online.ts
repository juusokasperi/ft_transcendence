// src/app/modes/online.ts
import { createEngine } from '@pong/render';
import { createLifecycle } from '@pong/render';
import { createWorld } from '@pong/render';
import { FXManager } from '@pong/render';
import { createScoreboard } from '@pong/render';
import { updateHUD } from '@pong/render';
import { applyFrameEventsToFx } from '@pong/render';
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
import type { RoomStateMessage, StartMessage } from '@pong/shared/protocol/net';
import { SERVE_SELECT_TOTAL_MS } from '@pong/shared';
import { rgb01ToCss } from './preferences';
import { clamp01 } from '@pong/shared';

import { wsUrl } from '../../../utils/url';

// Render/update cadence we expect from the authoritative node.
const CLIENT_TICK_RATE_HZ = 60;

// Normalised payload we await before starting the local loop.
type StartSignal = {
  startAtEpochMs: number;
  randomSeed: number;
  tickRateHz: number;
};

// --- Net placeholders (wire your transport here) -----------------------------------
type OnlineClient = {
  mySeat: PlayerSeat; // "P1" | "P2"
  onSnapshot(cb: (s: GameState, ev: FrameEvents, match?: MatchSnapshot) => void): void;
  onOpponentAxis(cb: (axis: number) => void): void; // scalar [-1..1]
  sendLocalAxis(axis: number): void; // called every tick
  disconnect(): void;
  onRoomState(cb: (state: RoomStateMessage) => void): void;
  onStart(cb: (payload: StartSignal) => void): void;
  awaitStart(): Promise<StartSignal>;
};

// Resolve this with your WebSocket/RTC layer (gateway today, potentially RTC later).
async function connectOnline(cfg: {
  serverUrl: string;
  matchId: string;
  roomIdentifier: string;
  seat: PlayerSeat;
  joinToken: string;
  randomSeed: number;
}): Promise<OnlineClient> {
  const { serverUrl, matchId, seat, joinToken, roomIdentifier } = cfg;
  const resolvedUrl = serverUrl.startsWith('ws') ? serverUrl : wsUrl(serverUrl);
  console.log(
    '[OnlineGame] Connecting to server:',
    resolvedUrl,
    'room:',
    roomIdentifier,
    'matchId:',
    matchId,
    'seat:',
    seat,
  );
  const gameWs = new WebSocket(resolvedUrl, ['bearer', joinToken]);

  return await new Promise<OnlineClient>((resolve, reject) => {
    let settled = false;
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      console.error('[OnlineGame] WebSocket failed before open:', reason);
      try {
        gameWs.close();
      } catch {
        /* ignore */
      }
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    };

    gameWs.addEventListener('error', (err) => fail(err));
    gameWs.addEventListener('close', (evt) => {
      if (!settled && gameWs.readyState !== WebSocket.OPEN) {
        fail(new Error(`WebSocket closed (${evt.code})`));
      }
    });

    gameWs.addEventListener('open', () => {
      settled = true;
      console.log('[OnlineGame] WebSocket connection opened');
      const snapshotListeners = new Set<
        (s: GameState, ev: FrameEvents, m?: MatchSnapshot) => void
      >();
      const opponentAxisListeners = new Set<(axis: number) => void>();
      const roomStateListeners = new Set<(state: RoomStateMessage) => void>();
      const startListeners = new Set<(payload: StartSignal) => void>();
      const startResolvers: Array<(payload: StartSignal) => void> = [];
      let startPayload: StartSignal | null = null;

      // Fan-out helper so listeners and awaiting promises see the same START payload.
      const notifyStart = (payload: StartSignal) => {
        startPayload = payload;
        startListeners.forEach((cb) => cb(payload));
        while (startResolvers.length) {
          const resolveStart = startResolvers.shift();
          resolveStart?.(payload);
        }
      };

      gameWs.addEventListener('message', (ev) => {
        let data: any;
        try {
          data = JSON.parse(ev.data as string);
        } catch (err) {
          console.warn('[OnlineGame] Failed to parse message', err);
          return;
        }

        switch (data.type) {
          case 'snapshot':
            snapshotListeners.forEach((cb) => cb(data.state, data.events, data.match));
            break;
          case 'opponentAxis':
            opponentAxisListeners.forEach((cb) => cb(data.axis));
            break;
          case 'ROOM_STATE':
            console.debug('[OnlineGame] Room state message', data);
            roomStateListeners.forEach((cb) => cb(data as RoomStateMessage));
            break;
          case 'START':
            const startMsg = data as StartMessage;
            const payload: StartSignal = {
              startAtEpochMs:
                typeof startMsg.startAtEpochMs === 'number' ? startMsg.startAtEpochMs : Date.now(),
              randomSeed:
                typeof startMsg.randomSeed === 'number' ? startMsg.randomSeed : cfg.randomSeed,
              tickRateHz:
                typeof startMsg.tickRateHz === 'number' ? startMsg.tickRateHz : CLIENT_TICK_RATE_HZ,
            };
            notifyStart(payload);
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
        onRoomState(cb) {
          roomStateListeners.add(cb);
        },
        onStart(cb) {
          startListeners.add(cb);
          if (startPayload) cb(startPayload);
        },
        awaitStart() {
          if (startPayload) return Promise.resolve(startPayload);
          return new Promise<StartSignal>((resolveStart) => {
            startResolvers.push(resolveStart);
          });
        },
        sendLocalAxis(axis: number) {
          if (gameWs.readyState === WebSocket.OPEN) {
            gameWs.send(JSON.stringify({ type: 'axis', axis }));
          }
        },
        disconnect() {
          console.log('[OnlineGame] Disconnecting WebSocket');
          startResolvers.length = 0;
          startListeners.clear();
          roomStateListeners.clear();
          snapshotListeners.clear();
          opponentAxisListeners.clear();
          try {
            gameWs.close();
          } catch {
            /* ignore */
          }
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
  cfg: {
    serverUrl: string;
    matchId: string;
    roomIdentifier: string;
    seat: PlayerSeat;
    joinToken: string;
    randomSeed: number;
  },
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
  const matchSeed = cfg.randomSeed ?? hash32(cfg.roomIdentifier ?? cfg.matchId);

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
    logicHz: CLIENT_TICK_RATE_HZ,
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
          const eastZ = hasPrev
            ? lerp(ref.paddles.east.z, snap.paddles.east.z, alpha)
            : snap.paddles.east.z;
          const westZ = hasPrev
            ? lerp(ref.paddles.west.z, snap.paddles.west.z, alpha)
            : snap.paddles.west.z;
          left.mesh.position.z = clampPaddleZ(eastZ);
          right.mesh.position.z = clampPaddleZ(westZ);
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
          if (ev) applyFrameEventsToFx(fx, ev, y);
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

    net.onRoomState((state) => {
      console.log('[OnlineGame] Room state update:', state);
      if (state.state === 'READY' && typeof state.startAtEpochMs === 'number') {
        const etaMs = Math.max(0, state.startAtEpochMs - Date.now());
        if (etaMs > 0) hud.flashMessage(`Match starting in ${(etaMs / 1000).toFixed(1)}s`, 1800);
      }
    });

    const startPromise = net.awaitStart();

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
        const last = latestMatch?.gamesHistory?.[latestMatch.gamesHistory.length - 1];
        if (last?.winner) {
          const winnerName = last.winner === 'east' ? names.east : names.west;
          hud.flashMessage(`${winnerName} won the game, swapping side!`, 3200);
        }
      }

      // Fire a DOM event once when the match concludes (parity with local mode)
      if (!didFireMatchOverEvent && anyEv && anyEv.matchOver) {
        didFireMatchOverEvent = true;
        const winner = anyEv.matchOver.winner as 'east' | 'west';
        const winnerName = winner === 'east' ? names.east : names.west;
        hud.flashMessage(`${winnerName} won, impressive match!`, 3800);
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

    const startInfo = await startPromise;
    if (startInfo.randomSeed !== cfg.randomSeed) {
      console.warn('[OnlineGame] Server randomSeed differs from handoff seed', {
        handoff: cfg.randomSeed,
        server: startInfo.randomSeed,
      });
    }

    const waitMs = Math.max(0, startInfo.startAtEpochMs - Date.now());
    if (waitMs > 0) {
      console.log(`[OnlineGame] Waiting ${waitMs}ms for server start tick`);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }

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
