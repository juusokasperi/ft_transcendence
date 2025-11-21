import {
  createLifecycle,
  applyFrameEventsToFx,
  applyFrameEventsToAudio,
  detectEnteredServe,
  onEnteredServe,
  attachLocalInput,
  setBindingProfile,
  readSeatAxes,
  blockInputFor,
  disposeWorld,
} from '@pong/render';
import { setTouchSeatVisibility } from '@pong/render';
import type { PlayerSeat } from '@pong/render';
import type { GameState } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import { SERVE_SELECT_TOTAL_MS, clamp01 } from '@pong/shared';
import { handleMatchOver, runServeSelectionIntro } from '../shared/utils';
import { createHudCache, updateOnlineHUDIfChanged } from './hud-cache';
import { createDisconnectOverlayManager, showMatchEndOverlay } from './ui-overlays';
import { connectOnline, type OnlineClient } from './connect-online';
import { getStoredResumeCandidate, clearStoredResumeTokens } from './resume';
import {
  BASE_PLAYBACK_DELAY_MS,
  PLAYBACK_EASING,
  clampPlaybackDelay,
  computeDesiredPlaybackDelay,
  createPingIndicator,
  bindPingHotkey,
} from './latency';
import { createOnlineWorld } from './world';
import { createFrameBuffer } from './frame-buffer';
import { createMatchLifecycle } from './match-lifecycle';
import { createSideSwapController } from './side-swap-controller';
import type { OnlineMatchSummary } from './types';
import { createPaddlePrediction } from './paddle-prediction';
import { createBallPrediction } from './ball-prediction';

// Render/update cadence we expect from the authoritative node.
const CLIENT_TICK_RATE_HZ = 60;

interface PongInstance {
  start(): void;
  destroy(): void;
  // Signal an intentional quit/forfeit from the local player.
  // Should not allow resume for this room.
  giveUp?(): void;
}

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[OnlineGame]', ...args);
  }
};

export function createOnlineApp(
  canvas: HTMLCanvasElement,
  cfg: {
    serverUrl: string;
    matchId: string;
    roomIdentifier: string;
    seat: PlayerSeat;
    joinToken: string;
    randomSeed: number;
    onMatchEnd?: (
      reason: string,
      winner?: 'east' | 'west',
      summary?: OnlineMatchSummary | null,
    ) => void;
  },
): PongInstance {
  const {
    engine,
    engineDisposable,
    world,
    bounds,
    hud,
    fx,
    audioKit,
    audioBus,
    Bounces,
    paddleAnim,
    sfxDetectors,
    clampPaddleZ,
    matColorCss,
  } = createOnlineWorld({
    canvas,
    randomSeed: cfg.randomSeed,
    roomIdentifier: cfg.roomIdentifier,
    matchId: cfg.matchId,
  });
  const {
    scene,
    paddles: { left, right },
    ball,
  } = world;

  const pingIndicator = createPingIndicator();
  const pingHotkey = bindPingHotkey(pingIndicator);

  const { showDisconnectOverlay, hideDisconnectOverlay } = createDisconnectOverlayManager(canvas);
  const seatToSide = (seat: PlayerSeat): 'east' | 'west' => (seat === 'P1' ? 'east' : 'west');
  let matchEnded = false;

  const showEnd = (reason: string, winner?: 'east' | 'west') => {
    // Use the current resolved seat (mySeat), not the initial cfg.seat,
    // to avoid incorrect messages after resume or side swaps.
    return showMatchEndOverlay(canvas, reason, winner, mySeat);
  };

  setBindingProfile('online');
  // Hide touch controls until we know our seat; will be updated once connected.
  setTouchSeatVisibility({ P1: false, P2: false });
  const detachInput = attachLocalInput(canvas);
  scene.onDisposeObservable.add(detachInput);

  let names = { east: 'Magenta', west: 'Green' };

  // --- Net state -------------------------------------------------------------------
  let net: OnlineClient | null = null;
  let mySeat: PlayerSeat = 'P1';
  const eventQueue: FrameEvents[] = [];
  let prevPhase: GameState['phase'] | null = null;
  let didBootFX = false;
  let isResumeMode = false;
  let didFireMatchOverEvent = false;
  let latestMatch: MatchSnapshot | undefined;
  let lastKnownBestOf = 3;
  const hudCache = createHudCache();
  let didSetPlayerNames = false;
  let playerAliases: { P1: string; P2: string } | null = null;
  let seatMap: { east: 'P1' | 'P2'; west: 'P1' | 'P2' } | null = null;
  const frameBuffer = createFrameBuffer(1000 / CLIENT_TICK_RATE_HZ);
  const paddlePrediction = createPaddlePrediction({
    seat: mySeat,
    maxZ: bounds.halfWidthZ - bounds.paddleHalfDepthZ,
  });
  const ballPrediction = createBallPrediction({
    halfWidthZ: bounds.halfWidthZ,
    ballRadius: bounds.ballRadius,
  });
  // Stable seat→material mapping so paddle colors follow players across swaps.
  const seatMaterials: { P1: any | null; P2: any | null } = { P1: null, P2: null };
  let seatMaterialsInitialized = false;

  const {
    finalizeMatch,
    ensureWaitingForOpponentTimeout,
    startCountdown: startStartCountdown,
    stopCountdown: stopStartCountdown,
    clearWaitingForOpponentTimeout,
    warnPoorConnectionIfNeeded,
  } = createMatchLifecycle({
    hud,
    getNames: () => names,
    getLatestMatch: () => latestMatch,
    getLastKnownBestOf: () => lastKnownBestOf,
    getSeatMap: () => seatMap,
    showEnd,
    onMatchEnd: cfg.onMatchEnd,
    seatToSide,
    getInitialSeat: () => cfg.seat,
    isMatchEnded: () => matchEnded,
    setMatchEnded: (ended) => {
      matchEnded = ended;
    },
    disconnectNet: () => {
      try {
        net?.disconnect();
      } catch {
        /* ignore */
      }
    },
    hideDisconnectOverlay,
  });

  let prevT = 0,
    currT = 0;
  let playbackDelayMs = clampPlaybackDelay(BASE_PLAYBACK_DELAY_MS);
  let desiredPlaybackDelayMs = playbackDelayMs;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const applyPlayerNames = () => {
    if (!playerAliases) return;
    names = { east: playerAliases.P1, west: playerAliases.P2 };
    hud.setPlayerNames(names.east, names.west);
    didSetPlayerNames = true;
  };

  const sideSwap = createSideSwapController({
    hud,
    camera: world.camera,
    leftMesh: left.mesh,
    rightMesh: right.mesh,
    paddleAnim,
    blockInputFor,
    getNames: () => names,
    getLatestMatch: () => latestMatch,
    getLastKnownBestOf: () => lastKnownBestOf,
    frameBuffer,
  });

  const loop = createLifecycle(engine, scene, {
    logicHz: CLIENT_TICK_RATE_HZ,
    update: (dtMs) => {
      // Online: send seat-centric axis; server maps seats to ends.
      const seatAxes = readSeatAxes();
      const localAxis = mySeat === 'P1' ? seatAxes.P1Axis : seatAxes.P2Axis;
      net?.sendLocalAxis(localAxis);

      const now = performance.now();
      const dtSec = Math.max(0, dtMs / 1000);
      // Advance local paddle and ball prediction using fixed-step dt.
      paddlePrediction.predict(dtSec, localAxis);
      const predictedBall = ballPrediction.predict(dtSec);

      playbackDelayMs += (desiredPlaybackDelayMs - playbackDelayMs) * PLAYBACK_EASING;
      const targetTime = now - playbackDelayMs;
      const {
        snap,
        ref,
        hasPrev,
        prevT: prevTSync,
        currT: currTSync,
      } = frameBuffer.sync(targetTime);
      prevT = prevTSync;
      currT = currTSync;
      const alpha = hasPrev ? clamp01((now - prevT) / Math.max(1, currT - prevT)) : 1;

      if (snap) {
        if (snap.playerAtEnd) {
          seatMap = {
            east: snap.playerAtEnd.east,
            west: snap.playerAtEnd.west,
          };
        }
        // Set HUD names once we know player aliases.
        // Keep rows pinned to player identity: east → P1, west → P2.
        if (!didSetPlayerNames && playerAliases !== null) {
          applyPlayerNames();
        }

        const refState = ref ?? snap;

        let ballX: number;
        let ballZ: number;
        let ballVX: number;

        if (predictedBall) {
          ballX = predictedBall.x;
          ballZ = predictedBall.z;
          ballVX = predictedBall.vx;
        } else {
          ballX = hasPrev ? lerp(refState.ball.x, snap.ball.x, alpha) : snap.ball.x;
          ballVX = hasPrev
            ? ((snap.ball.x - refState.ball.x) / Math.max(1, currT - prevT)) * 1000
            : 0;
          ballZ = hasPrev ? lerp(refState.ball.z, snap.ball.z, alpha) : snap.ball.z;
        }

        const ballY = Bounces.update(ballX, ballVX);

        ball.mesh.position.set(ballX, ballY, ballZ);

        sfxDetectors.update(ballY);

        if (!paddleAnim.isAnimating()) {
          const eastZBase = hasPrev
            ? lerp(refState.paddles.east.z, snap.paddles.east.z, alpha)
            : snap.paddles.east.z;
          const westZBase = hasPrev
            ? lerp(refState.paddles.west.z, snap.paddles.west.z, alpha)
            : snap.paddles.west.z;
          let eastZ = eastZBase;
          let westZ = westZBase;

          const predictedZ = paddlePrediction.getPredictedZ();
          if (predictedZ != null && snap.playerAtEnd) {
            const seatAtEast = snap.playerAtEnd.east;
            const seatAtWest = snap.playerAtEnd.west;
            if (seatAtEast === mySeat) {
              eastZ = predictedZ;
            } else if (seatAtWest === mySeat) {
              westZ = predictedZ;
            }
          }

          left.mesh.position.z = clampPaddleZ(eastZ);
          right.mesh.position.z = clampPaddleZ(westZ);
        }

        // Seat-based paddle materials: ensure each seat keeps a stable color
        // and colors follow players across side swaps.
        if (snap.playerAtEnd) {
          const eastSeat = snap.playerAtEnd.east;
          const westSeat = snap.playerAtEnd.west;
          if (!seatMaterialsInitialized) {
            seatMaterials[eastSeat] = left.mesh.material;
            seatMaterials[westSeat] = right.mesh.material;
            seatMaterialsInitialized = true;
          } else if (seatMaterials.P1 && seatMaterials.P2) {
            left.mesh.material = eastSeat === 'P1' ? seatMaterials.P1 : seatMaterials.P2;
            right.mesh.material = westSeat === 'P1' ? seatMaterials.P1 : seatMaterials.P2;
          }
        }

        // HUD (player-pinned) + name colors pinned to players
        // For online, keep HUD rows pinned to player identity (P1 top, P2 bottom)
        // regardless of which table end they occupy.
        let stateForHUD = snap;
        if (snap.playerAtEnd) {
          const serverSeat = snap.server === 'east' ? snap.playerAtEnd.east : snap.playerAtEnd.west;
          const serverRow = serverSeat === 'P1' ? 'east' : 'west';
          stateForHUD = {
            ...snap,
            points: { east: snap.pointsByPlayer.P1, west: snap.pointsByPlayer.P2 },
            server: serverRow,
          };
        }
        // Derive stable colors per player seat (P1/P2) and map them to HUD rows.
        let p1Css: string | null = null;
        let p2Css: string | null = null;
        if (seatMaterials.P1) p1Css = matColorCss(seatMaterials.P1);
        if (seatMaterials.P2) p2Css = matColorCss(seatMaterials.P2);
        // Fallback early on before seatMaterials are initialized.
        if (!p1Css || !p2Css) {
          const eastEndCss = matColorCss(left.mesh.material as any);
          const westEndCss = matColorCss(right.mesh.material as any);
          if (snap.playerAtEnd) {
            const eastSeat = snap.playerAtEnd.east;
            p1Css = eastSeat === 'P1' ? eastEndCss : westEndCss;
            p2Css = eastSeat === 'P1' ? westEndCss : eastEndCss;
          } else {
            p1Css = eastEndCss;
            p2Css = westEndCss;
          }
        }
        hud.setPlayerNameColors(p1Css!, p2Css!);
        {
          const snapForHud =
            latestMatch ??
            ({ bestOf: lastKnownBestOf, currentGameIndex: 0, gamesHistory: [] } as MatchSnapshot);
          updateOnlineHUDIfChanged(
            hud,
            stateForHUD,
            names,
            snapForHud,
            snapForHud.gamesHistory,
            hudCache,
          );
        }
      }

      if (eventQueue.length) {
        const y = ball.mesh.position.y;
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

  async function start() {
    debugLog('[OnlineGame] Starting online game with config:', cfg);
    matchEnded = false;
    clearWaitingForOpponentTimeout();
    blockInputFor(SERVE_SELECT_TOTAL_MS + 200);
    frameBuffer.reset();
    playbackDelayMs = clampPlaybackDelay(BASE_PLAYBACK_DELAY_MS);
    desiredPlaybackDelayMs = playbackDelayMs;

    try {
      // If we have a valid stored resume token for this room, auto-resume immediately.
      const candidate = getStoredResumeCandidate(cfg.roomIdentifier);
      if (candidate) {
        isResumeMode = true;
        net = await connectOnline(cfg, { resumeCandidate: candidate });
      } else if (cfg.joinToken) {
        isResumeMode = false;
        net = await connectOnline(cfg);
      }
    } catch (err) {
      if (isResumeMode) {
        // Clear invalid token and attempt a normal join if possible.
        clearStoredResumeTokens(cfg.roomIdentifier);
        if (cfg.joinToken) {
          try {
            isResumeMode = false;
            net = await connectOnline(cfg);
          } catch {
            // handled by the !net check below
          }
        }
      }
    }
    if (!net) {
      //debugLog('[OnlineGame] Unable to establish network connection');
      try {
        cfg.onMatchEnd?.('bootstrap_failed', undefined, null);
      } catch {}
      return;
    }
    mySeat = net.mySeat;
    paddlePrediction.reset(mySeat);
    // Show touch controls only for the local seat on mobile.
    setTouchSeatVisibility({
      P1: mySeat === 'P1',
      P2: mySeat === 'P2',
    });
    debugLog('[OnlineGame] Connected. My seat:', mySeat);

    void audioKit.start();

    net.onRoomState((state) => {
      debugLog('[OnlineGame] Room state update:', state);
      if (state.seat === 'P1' || state.seat === 'P2') {
        mySeat = state.seat;
        paddlePrediction.reset(mySeat);
        setTouchSeatVisibility({
          P1: mySeat === 'P1',
          P2: mySeat === 'P2',
        });
      }

      const players = state.players;
      if (players) {
        const aliasP1 = players.P1?.alias;
        const aliasP2 = players.P2?.alias;
        if (aliasP1 || aliasP2) {
          playerAliases = {
            P1: aliasP1 ?? playerAliases?.P1 ?? 'Player 1',
            P2: aliasP2 ?? playerAliases?.P2 ?? 'Player 2',
          };
          didSetPlayerNames = false;
          applyPlayerNames();
        }
      }

      if (state.state === 'READY' && typeof state.startAtEpochMs === 'number') {
        clearWaitingForOpponentTimeout();
        startStartCountdown(state.startAtEpochMs);
      } else if (state.state === 'PLAYING') {
        clearWaitingForOpponentTimeout();
        stopStartCountdown();
      } else if (state.state === 'WAITING_FOR_OPPONENT') {
        stopStartCountdown();
        ensureWaitingForOpponentTimeout(state);
      }
    });

    net.onStart((payload) => {
      if (payload.players) {
        playerAliases = {
          P1: payload.players.P1?.alias ?? 'Player 1',
          P2: payload.players.P2?.alias ?? 'Player 2',
        };
        didSetPlayerNames = false;
        applyPlayerNames();
      }
    });

    // Handle opponent disconnect events
    net.onOpponentDisconnected((gracePeriodMs: number) => {
      debugLog('[OnlineGame] Opponent disconnected, grace period:', gracePeriodMs);
      showDisconnectOverlay(gracePeriodMs);
    });

    net.onOpponentReconnected(() => {
      debugLog('[OnlineGame] Opponent reconnected');
      hideDisconnectOverlay();
    });

    net.onMatchEnd((reason, winner, summaryFromNet = null) => {
      debugLog('[OnlineGame] Match ended:', reason, 'winner:', winner);
      finalizeMatch(reason, winner, summaryFromNet);
    });

    net.onLatencyMeasured(({ avgMs, rttMs }) => {
      desiredPlaybackDelayMs = computeDesiredPlaybackDelay(avgMs);
      warnPoorConnectionIfNeeded(rttMs);
      pingHotkey.update(rttMs);
    });

    const startPromise = net.awaitStart();

    net.onSnapshot((s, ev, matchSnap) => {
      paddlePrediction.handleServerState(s, mySeat);
      ballPrediction.handleServerState(s);
      const stateBestOf = (s as any)?.params?.bestOf;
      if (typeof stateBestOf === 'number') {
        lastKnownBestOf = stateBestOf;
      }
      const prevPhaseBefore = prevPhase;
      if (!didBootFX) {
        didBootFX = true;
        // Only play the initial serve-intro when starting fresh, not resuming
        if (!isResumeMode) {
          void runServeSelectionIntro(fx, ball.mesh, s.server, (dir) => Bounces.scheduleServe(dir));
        } else {
          // Seed the mock-bounce planner so the very first in-play frames
          // use visual bounds immediately after resume (no intro).
          const dir = (s.ball.vx ?? 0) >= 0 ? (1 as 1) : (-1 as -1);
          Bounces.scheduleServe(dir);
        }
      }
      if (prevPhaseBefore && s.phase !== prevPhaseBefore) {
        const entered = detectEnteredServe(prevPhaseBefore, s.phase);
        if (entered) {
          onEnteredServe(entered, {
            ballMesh: ball.mesh,
            Bounces,
            paddleAnim,
            blockInputFor,
          });
        }
        if (prevPhaseBefore !== 'pauseBetweenGames' && s.phase === 'pauseBetweenGames') {
          sideSwap.handlePhaseTransition(prevPhaseBefore, s, matchSnap);
        }
      }
      prevPhase = s.phase;
      latestMatch = matchSnap ?? latestMatch;

      const anyEv = ev as any;
      if (anyEv && anyEv.swapSidesNow) {
        sideSwap.handleSwapEvent(prevPhaseBefore, s, matchSnap ?? latestMatch);
      }

      if (!didFireMatchOverEvent && anyEv && anyEv.matchOver) {
        didFireMatchOverEvent = true;
        handleMatchOver(
          hud,
          names,
          anyEv.matchOver.winner as 'east' | 'west',
          () =>
            latestMatch ?? {
              bestOf: lastKnownBestOf,
              currentGameIndex: 0,
              gamesHistory: [],
            },
          canvas,
        );
        audioKit.stop();
      }

      frameBuffer.enqueue(s);

      if (ev && (ev.wallHit || ev.paddleHit || ev.explode)) {
        if (eventQueue.length > 8) eventQueue.splice(0, eventQueue.length - 8);
        eventQueue.push(ev);
      }
    });

    const startInfo = await startPromise;
    const tickMs = 1000 / Math.max(1, startInfo.tickRateHz || CLIENT_TICK_RATE_HZ);
    frameBuffer.setTickMs(tickMs);
    if (startInfo.randomSeed !== cfg.randomSeed) {
      debugLog('[OnlineGame] Server randomSeed differs from handoff seed', {
        handoff: cfg.randomSeed,
        server: startInfo.randomSeed,
      });
    }

    // Store player aliases to set them once we know the actual positions
    if (startInfo.players) {
      playerAliases = {
        P1: startInfo.players.P1?.alias || 'Player 1',
        P2: startInfo.players.P2?.alias || 'Player 2',
      };
      debugLog('[OnlineGame] Player aliases from server:', playerAliases);
    }

    const waitMs = Math.max(0, startInfo.startAtEpochMs - Date.now());
    if (waitMs > 0) {
      startStartCountdown(startInfo.startAtEpochMs);
      debugLog(`[OnlineGame] Waiting ${waitMs}ms for server start tick`);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    stopStartCountdown();

    loop.start();
    debugLog('[OnlineGame] Game loop started');
  }

  const destroy = () => {
    debugLog('[OnlineGame] Destroying online game');

    clearWaitingForOpponentTimeout();
    matchEnded = true;
    frameBuffer.reset();

    // Clean up disconnect overlay
    hideDisconnectOverlay();
    pingHotkey.dispose();
    pingIndicator.detach();

    disposeWorld({
      loop,
      net: net || undefined,
      world,
      fx,
      hud,
      engineDisposable,
    });
    try {
      audioKit.dispose();
    } catch {}
  };

  const giveUp = () => {
    try {
      // Do not allow resume after an intentional forfeit.
      clearStoredResumeTokens(cfg.roomIdentifier);
      // Intentionally forfeit the match; server will end it.
      net?.forfeit?.();
    } catch {}
  };

  return { start, destroy, giveUp };
}
