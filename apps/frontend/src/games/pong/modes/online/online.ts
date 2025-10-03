// src/app/modes/online.ts
import { createEngine } from '@pong/render';
import { createLifecycle } from '@pong/render';
import { createWorld } from '@pong/render';
import { FXManager } from '@pong/render';
import { createScoreboard } from '@pong/render';
import { updateHUD } from '@pong/render';
import { applyFrameEventsToFx } from '@pong/render';
import { applyFrameEventsToAudio } from '@pong/render';
import { computeBounds } from '@pong/render';
import { detectEnteredServe, onEnteredServe } from '@pong/render';
import { mapStateForPlayerRows } from '@pong/render';
import { attachLocalInput } from '@pong/render';
import { setBindingProfile } from '@pong/render';
import { createBounces } from '@pong/render';
import { createPaddleAnimator } from '@pong/render';
import { orbitCameraFor } from '@pong/render';
import { incHide, decHide } from '@pong/render';

import { readIntent } from '@pong/render';
import { blockInputFor } from '@pong/render';
import { /* mixOnlineAxes, */ type PlayerSeat } from '@pong/render';
import { disposeWorld } from '@pong/render';

import type { GameState } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import type { RoomStateMessage, StartMessage } from '@pong/shared/protocol/net';
import { SERVE_SELECT_TOTAL_MS } from '@pong/shared';
import { rgb01ToCss } from '../preferences';
import { clamp01 } from '@pong/shared';

import { wsUrl } from '../../../../utils/url';
import { swapPaddleMaterials, handleSwapSidesNow, handleMatchOver } from '../shared-utils';
import { createLocalAudioKit, createLocalSfxDetectors } from '../audio-utils';

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

  // ── Audio (shared with local mode) ───────────────────────────────────────────────
  const audioKit = createLocalAudioKit(scene, canvas);
  const audioBus = audioKit.bus;

  // Helper: derive CSS color from a paddle mesh's material tint
  const matColorCss = (mat: any): string => {
    const c = mat?.subSurface?.tintColor ?? mat?.diffuseColor ?? mat?.albedoColor;
    return rgb01ToCss({ r: c?.r ?? 1, g: c?.g ?? 1, b: c?.b ?? 1 });
  };
  const syncHudNameColors = () => {
    const leftMat: any = left.mesh.material as any;
    const rightMat: any = right.mesh.material as any;
    // Top row = east; left mesh drives EAST channel (leftAxis → east)
    const eastCss = matColorCss(leftMat);
    const westCss = matColorCss(rightMat);
    hud.setPlayerNameColors(eastCss, westCss);
  };
  // Colors are updated every snapshot based on snapshot occupancy and rowsMirrored

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

  // Local-only SFX detectors (render-derived bounce cues)
  const BASE_Y_FOR_AUDIO = table.tableTop.position.y + bounds.ballRadius / 2;
  const sfxDetectors = createLocalSfxDetectors(audioBus, BASE_Y_FOR_AUDIO);

  // Local render clamp to match table and paddle geometry
  const paddleMaxZ = bounds.halfWidthZ - bounds.paddleHalfDepthZ;
  const clampPaddleZ = (z: number) => Math.max(-paddleMaxZ, Math.min(paddleMaxZ, z));

  // --- Net state -------------------------------------------------------------------
  let net!: OnlineClient;
  let mySeat: PlayerSeat = 'P1'; // set after connect()
  // opponent axis stream is currently unused in the thin client
  let latest: GameState | null = null; // latest server snapshot
  const eventQueue: FrameEvents[] = []; // buffer to avoid dropping events between frames
  let prevPhase: GameState['phase'] | null = null;
  let didBootFX = false;
  let didFireMatchOverEvent = false;
  let latestMatch: MatchSnapshot | undefined;
  // Prevent double rotations: track a scheduled between-games spin window, and
  // whether we've shown a rotation for the current between-games pause.
  let spinningUntilMs = 0;
  let didBetweenGamesSpin = false;

  // Simple (optional) rows mirroring knob if you choose to flip per-game
  // NOTE: With server-authoritative flow, you can toggle this via messages.
  let rowsMirrored = false;
  // Live countdown timer for server start
  let startCountdownTimer: number | null = null;

  function stopStartCountdown() {
    if (startCountdownTimer !== null) {
      clearInterval(startCountdownTimer);
      startCountdownTimer = null;
    }
    hud.flashMessage('', 0);
  }

  function startStartCountdown(untilEpochMs: number) {
    stopStartCountdown();
    const tick = () => {
      const remain = Math.max(0, untilEpochMs - Date.now());
      if (remain <= 0) {
        stopStartCountdown();
        return;
      }
      const secs = remain / 1000;
      const text =
        secs >= 10 ? `Match starts in ${Math.ceil(secs)}s` : `Match starts in ${secs.toFixed(1)}s`;
      hud.flashMessage(text, 500);
    };
    tick();
    startCountdownTimer = window.setInterval(tick, 120);
  }

  // Interpolation cache (keep tiny: just ball X and paddle Z’s)
  let prevSnap: GameState | null = null;
  let prevT = 0,
    currT = 0; // ms timestamps for snapshots
  let tickMs = 1000 / CLIENT_TICK_RATE_HZ;
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
      // Interpolate from prevSnap (at prevT) to latest (at currT)
      const alpha = hasPrev ? clamp01((now - prevT) / Math.max(1, currT - prevT)) : 1;

      const snap = latest ?? prevSnap;
      if (snap) {
        // Interpolate a few hot fields; fall back to latest when no prev.
        const ref = prevSnap ?? snap;
        const ballX = hasPrev ? lerp(ref.ball.x, snap.ball.x, alpha) : snap.ball.x;
        const ballVX = hasPrev
          ? ((snap.ball.x - ref.ball.x) / Math.max(1, currT - prevT)) * 1000
          : 0;

        // Ball Y via the same visual bounce helper used locally
        const ballY = Bounces.update(ballX, ballVX);

        ball.mesh.position.set(
          ballX,
          ballY,
          hasPrev ? lerp(ref.ball.z, snap.ball.z, alpha) : snap.ball.z,
        );

        // Local-only SFX cues derived from visuals
        sfxDetectors.update(ballY);

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

        // 3) HUD (player-pinned) + name colors pinned to players
        const stateForHUD = mapStateForPlayerRows(snap, rowsMirrored);
        // Compute current row colors from materials, remapped to players when rowsMirrored
        const eastEndCss = matColorCss(left.mesh.material as any);
        const westEndCss = matColorCss(right.mesh.material as any);
        if (rowsMirrored) {
          // Top row = P1, bottom row = P2
          const topCss = snap.playerAtEnd.east === 'P1' ? eastEndCss : westEndCss;
          const bottomCss = snap.playerAtEnd.east === 'P2' ? eastEndCss : westEndCss;
          hud.setPlayerNameColors(topCss, bottomCss);
        } else {
          // Top row = east end; bottom row = west end
          hud.setPlayerNameColors(eastEndCss, westEndCss);
        }
        updateHUD(hud, stateForHUD, names, latestMatch);
      }

      // 4) Drain FX events queued from snapshots (avoid dropping on mismatch rates)
      if (eventQueue.length) {
        const y = ball.mesh.position.y;
        // apply all pending events this frame (they are cheap)
        while (eventQueue.length) {
          const ev = eventQueue.shift();
          if (ev) {
            applyFrameEventsToFx(fx, ev, y);
            applyFrameEventsToAudio(audioBus, ev);
          }
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

    // Boot audio after connecting (mirrors local mode UX)
    void audioKit.start();

    net.onRoomState((state) => {
      console.log('[OnlineGame] Room state update:', state);
      if (state.state === 'READY' && typeof state.startAtEpochMs === 'number') {
        startStartCountdown(state.startAtEpochMs);
      } else if (state.state === 'PLAYING') {
        stopStartCountdown();
      }
    });

    const startPromise = net.awaitStart();

    // We accept opponent-axis pings from the server for future use (e.g.,
    // client-side prediction), but we do not use them in the thin client yet.
    // net.onOpponentAxis(() => {});

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
          // Trigger serve cues immediately so paddle tween starts before
          // the next render update applies server-centered paddle poses.
          onEnteredServe(entered, {
            ballMesh: ball.mesh,
            Bounces,
            paddleAnim,
            blockInputFor,
          });
        }
        // Entered between-games pause → show message + spin camera and schedule swap at half
        if (prevPhase !== 'pauseBetweenGames' && s.phase === 'pauseBetweenGames') {
          const rawMs = Math.max(0, (s as any).tPauseBtwGamesMs ?? 0);
          // Cushion by ~one server tick to counteract snapshot latency so the
          // rotation completes just before the server resumes play.
          const ms = Math.max(0, rawMs - tickMs);
          const until = handleSwapSidesNow(
            hud,
            'gameOver',
            () =>
              matchSnap ??
              latestMatch ?? { bestOf: s.params.bestOf, currentGameIndex: 0, gamesHistory: [] },
            names,
            blockInputFor,
            ms,
          );
          spinningUntilMs = until;
          didBetweenGamesSpin = true;
          const now = performance.now();
          const spinMs = Math.max(0, until - now);
          if (spinMs > 0) {
            orbitCameraFor(world.camera, spinMs, {
              onHalf: () => {
                // Between-games: no paddle centering animation here to avoid
                // a snap-back before the new game's serve cue runs.
              },
            });
          }
        }
      }
      prevPhase = s.phase;
      latestMatch = matchSnap ?? latestMatch;

      // Respond to server signaled side swaps (if present in events)
      const anyEv = ev as any;
      if (anyEv && anyEv.swapSidesNow) {
        const now = performance.now();
        if (spinningUntilMs > now || didBetweenGamesSpin || s.phase === 'pauseBetweenGames') {
          // Between-games (or during the scheduled spin): apply swap immediately
          // with NO paddle centering animation. Serve cue will animate later.
          rowsMirrored = !rowsMirrored;
          swapPaddleMaterials(left.mesh, right.mesh);
          spinningUntilMs = 0;
          didBetweenGamesSpin = false;
        } else {
          // Mid-game (or fallback) swap: show message + spin and swap at mid-spin for UX.
          const until = handleSwapSidesNow(
            hud,
            prevPhase as GameState['phase'],
            () =>
              matchSnap ??
              latestMatch ?? { bestOf: s.params.bestOf, currentGameIndex: 0, gamesHistory: [] },
            names,
            blockInputFor,
          );
          const spinMs = Math.max(0, until - now);
          if (spinMs > 0) {
            orbitCameraFor(world.camera, spinMs, {
              onHalf: () => {
                rowsMirrored = !rowsMirrored;
                swapPaddleMaterials(left.mesh, right.mesh);
                paddleAnim.cue(180);
              },
            });
          } else {
            rowsMirrored = !rowsMirrored;
            swapPaddleMaterials(left.mesh, right.mesh);
            paddleAnim.cue(180);
          }
        }
      }

      // Fire a DOM event once when the match concludes (parity with local mode)
      if (!didFireMatchOverEvent && anyEv && anyEv.matchOver) {
        didFireMatchOverEvent = true;
        handleMatchOver(
          hud,
          names,
          anyEv.matchOver.winner as 'east' | 'west',
          () => latestMatch ?? { bestOf: s.params.bestOf, currentGameIndex: 0, gamesHistory: [] },
          canvas,
        );
        // Stop match playlist when match concludes
        audioKit.stop();
      }

      // Snapshot ring for tiny interpolation
      if (!prevSnap) {
        // Prime interpolation window on first snapshot
        prevSnap = s;
        latest = s;
        const t0 = performance.now();
        prevT = t0;
        currT = t0 + tickMs;
      } else {
        prevSnap = latest ?? s;
        latest = s;
        prevT = currT;
        currT = currT + tickMs;
      }

      // Queue FX events from this snapshot; avoid overwriting if multiple snapshots arrive
      if (ev && (ev.wallHit || ev.paddleHit || ev.explode)) {
        // cap queue size to prevent unbounded growth under extreme lag
        if (eventQueue.length > 8) eventQueue.splice(0, eventQueue.length - 8);
        eventQueue.push(ev);
      }
    });

    const startInfo = await startPromise;
    tickMs = 1000 / Math.max(1, startInfo.tickRateHz || CLIENT_TICK_RATE_HZ);
    if (startInfo.randomSeed !== cfg.randomSeed) {
      console.warn('[OnlineGame] Server randomSeed differs from handoff seed', {
        handoff: cfg.randomSeed,
        server: startInfo.randomSeed,
      });
    }

    const waitMs = Math.max(0, startInfo.startAtEpochMs - Date.now());
    if (waitMs > 0) {
      startStartCountdown(startInfo.startAtEpochMs);
      console.log(`[OnlineGame] Waiting ${waitMs}ms for server start tick`);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    stopStartCountdown();

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
    try {
      audioKit.dispose();
    } catch {}
  };

  return { start, destroy };
}
