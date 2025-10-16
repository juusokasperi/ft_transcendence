import {
  createEngine,
  createLifecycle,
  createWorld,
  FXManager,
  createScoreboard,
  updateHUD,
  applyFrameEventsToFx,
  applyFrameEventsToAudio,
  computeBounds,
  detectEnteredServe,
  onEnteredServe,
  mapStateForPlayerRows,
  attachLocalInput,
  setBindingProfile,
  createBounces,
  createPaddleAnimator,
  orbitCameraFor,
  readIntent,
  blockInputFor,
  disposeWorld,
} from '@pong/render';
import type { PlayerSeat } from '@pong/render';
import type { GameState } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import { SERVE_SELECT_TOTAL_MS, clamp01 } from '@pong/shared';
import { rgb01ToCss } from '../preferences';
import {
  swapPaddleMaterials,
  handleSwapSidesNow,
  handleMatchOver,
  runServeSelectionIntro,
} from '../shared/utils';
import { createLocalAudioKit, createLocalSfxDetectors } from '../shared/audio-utils';
import { connectOnline, type OnlineClient } from './connect-online';
import type { OnlineMatchSummary } from './types';

// Render/update cadence we expect from the authoritative node.
const CLIENT_TICK_RATE_HZ = 60;

interface PongInstance {
  start(): void;
  destroy(): void;
}

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
  const { engine, engineDisposable } = createEngine(canvas);
  const world = createWorld(engine);
  const {
    scene,
    paddles: { left, right },
    table,
    ball,
  } = world;

  const hud = createScoreboard();
  hud.attachToCanvas(canvas);

  // Disconnect overlay
  let disconnectOverlay: HTMLDivElement | null = null;
  let reconnectCountdownInterval: number | null = null;

  const showDisconnectOverlay = (gracePeriodMs: number) => {
    if (!disconnectOverlay) {
      disconnectOverlay = document.createElement('div');
      disconnectOverlay.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: #fbbf24;
        padding: 2rem;
        border-radius: 0.5rem;
        border: 2px solid #fbbf24;
        font-size: 1.25rem;
        font-weight: bold;
        text-align: center;
        z-index: 1000;
        pointer-events: none;
      `;
      canvas.parentElement?.appendChild(disconnectOverlay);
    }

    const endTime = Date.now() + gracePeriodMs;
    const isTournament = gracePeriodMs <= 10000; // 10 seconds = tournament, 15 seconds = casual

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      if (disconnectOverlay) {
        // Both tournament and casual matches now award victory after timeout
        disconnectOverlay.textContent = `Opponent disconnected. Waiting ${remaining}s before auto-win...`;
      }
      if (remaining <= 0 && reconnectCountdownInterval) {
        clearInterval(reconnectCountdownInterval);
        reconnectCountdownInterval = null;
      }
    };

    updateCountdown();
    if (reconnectCountdownInterval) clearInterval(reconnectCountdownInterval);
    reconnectCountdownInterval = window.setInterval(updateCountdown, 1000);
  };

  const hideDisconnectOverlay = () => {
    if (reconnectCountdownInterval) {
      clearInterval(reconnectCountdownInterval);
      reconnectCountdownInterval = null;
    }
    if (disconnectOverlay) {
      disconnectOverlay.remove();
      disconnectOverlay = null;
    }
  };

  const showMatchEndOverlay = (reason: string, winner?: 'east' | 'west') => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.95);
      color: #fff;
      padding: 2rem;
      border-radius: 0.5rem;
      border: 2px solid #10b981;
      font-size: 1.5rem;
      font-weight: bold;
      text-align: center;
      z-index: 1000;
      pointer-events: none;
    `;

    let message = 'Match ended';
    if (reason === 'opponent_timeout') {
      if (winner) {
        // Both tournament and casual matches now have a winner
        const youWon =
          (cfg.seat === 'P1' && winner === 'east') || (cfg.seat === 'P2' && winner === 'west');
        message = youWon ? 'You won! (Opponent disconnected)' : 'You lost (Disconnected)';
        overlay.style.borderColor = youWon ? '#10b981' : '#ef4444';
        overlay.style.color = youWon ? '#10b981' : '#ef4444';
      } else {
        // Fallback (should not happen anymore)
        message = 'Opponent disconnected - Match ended';
        overlay.style.borderColor = '#f59e0b';
        overlay.style.color = '#f59e0b';
      }
    }

    overlay.textContent = message;
    canvas.parentElement?.appendChild(overlay);

    setTimeout(() => {
      overlay.remove();
    }, 5000);
  };

  setBindingProfile('online');
  const detachInput = attachLocalInput(canvas);
  scene.onDisposeObservable.add(detachInput);

  let names = { east: 'Magenta', west: 'Green' };

  const { bounds } = computeBounds(world);
  const fx = new FXManager(scene, {
    wallZNorth: +bounds.halfWidthZ,
    wallZSouth: -bounds.halfWidthZ,
    ballMesh: ball.mesh,
    ballRadius: bounds.ballRadius,
    tableTop: table.tableTop,
    camera: world.camera,
  });

  const audioKit = createLocalAudioKit(scene, canvas);
  const audioBus = audioKit.bus;

  // derive CSS color from a paddle mesh's material tint
  const matColorCss = (mat: any): string => {
    const c = mat?.subSurface?.tintColor ?? mat?.diffuseColor ?? mat?.albedoColor;
    return rgb01ToCss({ r: c?.r ?? 1, g: c?.g ?? 1, b: c?.b ?? 1 });
  };

  function hash32(s: string): number {
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

  const paddleAnim = createPaddleAnimator(scene, left.mesh, right.mesh);

  const BASE_Y_FOR_AUDIO = table.tableTop.position.y + bounds.ballRadius / 2;
  const sfxDetectors = createLocalSfxDetectors(audioBus, BASE_Y_FOR_AUDIO);

  const paddleMaxZ = bounds.halfWidthZ - bounds.paddleHalfDepthZ;
  const clampPaddleZ = (z: number) => Math.max(-paddleMaxZ, Math.min(paddleMaxZ, z));

  // --- Net state -------------------------------------------------------------------
  let net!: OnlineClient;
  let mySeat: PlayerSeat = 'P1';
  let latest: GameState | null = null;
  const eventQueue: FrameEvents[] = [];
  let prevPhase: GameState['phase'] | null = null;
  let didBootFX = false;
  let didFireMatchOverEvent = false;
  let latestMatch: MatchSnapshot | undefined;
  let lastKnownBestOf = 3;
  let spinningUntilMs = 0;
  let didBetweenGamesSpin = false;
  let didSetPlayerNames = false;
  let playerAliases: { P1: string; P2: string } | null = null;
  let seatMap: { east: 'P1' | 'P2'; west: 'P1' | 'P2' } | null = null;

  let rowsMirrored = false;
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

  let prevSnap: GameState | null = null;
  let prevT = 0,
    currT = 0;
  let tickMs = 1000 / CLIENT_TICK_RATE_HZ;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const loop = createLifecycle(engine, scene, {
    logicHz: CLIENT_TICK_RATE_HZ,
    update: () => {
      const inpt = readIntent();
      const localAxis = mySeat === 'P1' ? inpt.leftAxis : inpt.rightAxis;
      net?.sendLocalAxis(localAxis);

      const now = performance.now();
      const hasPrev = !!prevSnap && prevT < currT;
      const alpha = hasPrev ? clamp01((now - prevT) / Math.max(1, currT - prevT)) : 1;

      const snap = latest ?? prevSnap;
      if (snap) {
        if (snap.playerAtEnd) {
          seatMap = {
            east: snap.playerAtEnd.east,
            west: snap.playerAtEnd.west,
          };
        }
        // Set player names once we have playerAtEnd info
        if (!didSetPlayerNames && playerAliases !== null && snap.playerAtEnd) {
          const aliases = playerAliases; // TypeScript hint
          const eastAlias = snap.playerAtEnd.east === 'P1' ? aliases.P1 : aliases.P2;
          const westAlias = snap.playerAtEnd.west === 'P1' ? aliases.P1 : aliases.P2;

          names = { east: eastAlias, west: westAlias };
          hud.setPlayerNames(eastAlias, westAlias);
          didSetPlayerNames = true;
          seatMap = {
            east: snap.playerAtEnd.east,
            west: snap.playerAtEnd.west,
          };

          console.log(
            `[OnlineGame] Set player names based on actual positions: east=${eastAlias} (${snap.playerAtEnd.east}), west=${westAlias} (${snap.playerAtEnd.west})`,
          );
        }

        const ref = prevSnap ?? snap;
        const ballX = hasPrev ? lerp(ref.ball.x, snap.ball.x, alpha) : snap.ball.x;
        const ballVX = hasPrev
          ? ((snap.ball.x - ref.ball.x) / Math.max(1, currT - prevT)) * 1000
          : 0;
        const ballY = Bounces.update(ballX, ballVX);

        ball.mesh.position.set(
          ballX,
          ballY,
          hasPrev ? lerp(ref.ball.z, snap.ball.z, alpha) : snap.ball.z,
        );

        sfxDetectors.update(ballY);

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

        // HUD (player-pinned) + name colors pinned to players
        const stateForHUD = mapStateForPlayerRows(snap, rowsMirrored);
        const eastEndCss = matColorCss(left.mesh.material as any);
        const westEndCss = matColorCss(right.mesh.material as any);
        if (rowsMirrored) {
          const topCss = snap.playerAtEnd.east === 'P1' ? eastEndCss : westEndCss;
          const bottomCss = snap.playerAtEnd.east === 'P2' ? eastEndCss : westEndCss;
          hud.setPlayerNameColors(topCss, bottomCss);
        } else {
          hud.setPlayerNameColors(eastEndCss, westEndCss);
        }
        updateHUD(hud, stateForHUD, names, latestMatch);
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
    console.log('[OnlineGame] Starting online game with config:', cfg);
    blockInputFor(SERVE_SELECT_TOTAL_MS + 200);

    net = await connectOnline(cfg);
    mySeat = net.mySeat;
    console.log('[OnlineGame] Connected. My seat:', mySeat);

    void audioKit.start();

    net.onRoomState((state) => {
      console.log('[OnlineGame] Room state update:', state);
      if (state.state === 'READY' && typeof state.startAtEpochMs === 'number') {
        startStartCountdown(state.startAtEpochMs);
      } else if (state.state === 'PLAYING') {
        stopStartCountdown();
      }
    });

    // Handle opponent disconnect events
    net.onOpponentDisconnected((gracePeriodMs: number) => {
      console.log('[OnlineGame] Opponent disconnected, grace period:', gracePeriodMs);
      showDisconnectOverlay(gracePeriodMs);
    });

    net.onOpponentReconnected(() => {
      console.log('[OnlineGame] Opponent reconnected');
      hideDisconnectOverlay();
    });

    net.onMatchEnd(
      (
        reason: string,
        winner?: 'east' | 'west',
        summaryFromNet: OnlineMatchSummary | null = null,
      ) => {
        console.log('[OnlineGame] Match ended:', reason, 'winner:', winner);
        hideDisconnectOverlay();
        const eastAlias = names.east;
        const westAlias = names.west;
        const history = (latestMatch?.gamesHistory ?? []).map((game) => ({ ...game }));
        const defaultWinner =
          (reason === 'completed' && winner ? winner : history.at(-1)?.winner) ?? 'east';
        const defaultBestOf = latestMatch?.bestOf ?? lastKnownBestOf;
        const mergedSummary: OnlineMatchSummary = summaryFromNet
          ? {
              ...summaryFromNet,
              winner: summaryFromNet.winner ?? defaultWinner,
              bestOf: summaryFromNet.bestOf ?? defaultBestOf,
              gamesHistory:
                summaryFromNet.gamesHistory && summaryFromNet.gamesHistory.length
                  ? summaryFromNet.gamesHistory
                  : history,
              names: {
                east: summaryFromNet.names?.east ?? eastAlias,
                west: summaryFromNet.names?.west ?? westAlias,
              },
              seats: summaryFromNet.seats ?? seatMap ?? undefined,
              mmr: summaryFromNet.mmr ?? {
                east: { before: 0, after: 0 },
                west: { before: 0, after: 0 },
              },
            }
          : {
              winner: defaultWinner,
              bestOf: defaultBestOf,
              gamesHistory: history,
              names: { east: eastAlias, west: westAlias },
              seats: seatMap ?? undefined,
              mmr: {
                east: { before: 0, after: 0 },
                west: { before: 0, after: 0 },
              },
            };

        const resolvedWinner = mergedSummary.winner;
        showMatchEndOverlay(reason, resolvedWinner);

        cfg.onMatchEnd?.(reason, resolvedWinner, mergedSummary);
      },
    );

    const startPromise = net.awaitStart();

    net.onSnapshot((s, ev, matchSnap) => {
      const stateBestOf = (s as any)?.params?.bestOf;
      if (typeof stateBestOf === 'number') {
        lastKnownBestOf = stateBestOf;
      }
      if (!didBootFX) {
        didBootFX = true;
        void runServeSelectionIntro(fx, ball.mesh, s.server, (dir) => Bounces.scheduleServe(dir));
      }
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
        if (prevPhase !== 'pauseBetweenGames' && s.phase === 'pauseBetweenGames') {
          const rawMs = Math.max(0, (s as any).tPauseBtwGamesMs ?? 0);
          const ms = Math.max(0, rawMs - tickMs);
          const until = handleSwapSidesNow(
            hud,
            'gameOver',
            () =>
              matchSnap ??
              latestMatch ?? {
                bestOf: lastKnownBestOf,
                currentGameIndex: 0,
                gamesHistory: [],
              },
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
                // no paddle centering here between games
              },
            });
          }
        }
      }
      prevPhase = s.phase;
      latestMatch = matchSnap ?? latestMatch;

      const anyEv = ev as any;
      if (anyEv && anyEv.swapSidesNow) {
        const now = performance.now();
        if (spinningUntilMs > now || didBetweenGamesSpin || s.phase === 'pauseBetweenGames') {
          rowsMirrored = !rowsMirrored;
          swapPaddleMaterials(left.mesh, right.mesh);
          spinningUntilMs = 0;
          didBetweenGamesSpin = false;
        } else {
          const until = handleSwapSidesNow(
            hud,
            prevPhase as GameState['phase'],
            () =>
              matchSnap ??
              latestMatch ?? {
                bestOf: lastKnownBestOf,
                currentGameIndex: 0,
                gamesHistory: [],
              },
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

      if (!prevSnap) {
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

      if (ev && (ev.wallHit || ev.paddleHit || ev.explode)) {
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

    // Store player aliases to set them once we know the actual positions
    if (startInfo.players) {
      playerAliases = {
        P1: startInfo.players.P1?.alias || 'Player 1',
        P2: startInfo.players.P2?.alias || 'Player 2',
      };
      console.log('[OnlineGame] Player aliases from server:', playerAliases);
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

    // Clean up disconnect overlay
    hideDisconnectOverlay();

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
