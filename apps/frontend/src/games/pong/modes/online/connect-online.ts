import type { GameState } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import type {
  GameServerControlMessage,
  OnlineMatchSummary,
  RoomStateMessage,
  StartMessage,
} from '@pong/shared/protocol/net';
import type { PlayerSeat } from '@pong/render';
import { wsUrl } from '../../../../utils/url';
import { readJwtExpSec, clearResumeForRoom, saveResumeTokenToSession } from './resume';
export {
  getStoredResumeCandidate,
  clearStoredResumeTokens,
  findAnyStoredResumeCandidate,
} from './resume';
import { createReconnector } from './reconnect';
import { CLOSE_CODES } from '@pong/shared/protocol/net';

// Render/update cadence we expect from the authoritative node.
const CLIENT_TICK_RATE_HZ = 60;
const PERMANENT_CLOSE_CODES = new Set(Object.values(CLOSE_CODES));

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    console.debug('[OnlineGame]', ...args);
  }
};

export type StartSignal = {
  startAtEpochMs: number;
  randomSeed: number;
  tickRateHz: number;
  players?: {
    P1?: { alias?: string };
    P2?: { alias?: string };
  };
};

export type OnlineClient = {
  mySeat: PlayerSeat; // "P1" | "P2"
  onSnapshot(cb: (s: GameState, ev: FrameEvents, match?: MatchSnapshot) => void): void;
  onOpponentAxis(cb: (axis: number) => void): void; // scalar [-1..1]
  sendLocalAxis(axis: number): void; // called every tick
  disconnect(): void;
  onRoomState(cb: (state: RoomStateMessage) => void): void;
  onStart(cb: (payload: StartSignal) => void): void;
  awaitStart(): Promise<StartSignal>;
  onOpponentDisconnected(cb: (gracePeriodMs: number) => void): void;
  onOpponentReconnected(cb: () => void): void;
  onMatchEnd(
    cb: (reason: string, winner?: 'east' | 'west', summary?: OnlineMatchSummary | null) => void,
  ): void;
  onSelfReconnected(cb: (resumeDelayMs: number) => void): void;
  onLatencyMeasured(cb: (sample: { rttMs: number; avgMs: number }) => void): void;
  forfeit(): void;
};

export type ConnectConfig = {
  serverUrl: string;
  matchId: string;
  roomIdentifier: string;
  seat: PlayerSeat;
  joinToken: string;
  randomSeed: number;
};

// Candidate resume token with expiration time (seconds since epoch).
export type ResumeCandidate = { token: string; expSec: number };

// Resolve this with your WebSocket/RTC layer (gateway today, potentially RTC later).
export async function connectOnline(
  cfg: ConnectConfig,
  options: { resumeCandidate?: ResumeCandidate } = {},
): Promise<OnlineClient> {
  const { serverUrl, matchId, seat, joinToken, roomIdentifier } = cfg;
  const resolvedUrl = serverUrl.startsWith('ws') ? serverUrl : wsUrl(serverUrl);
  debugLog(
    '[OnlineGame] Connecting to server:',
    resolvedUrl,
    'room:',
    roomIdentifier,
    'matchId:',
    matchId,
    'seat:',
    seat,
  );
  // If caller provided a resume candidate, try resume-first; else fall back to join.
  const stored = options.resumeCandidate ?? null;
  const initialProtocols: [string, string] | null = stored
    ? stored.token
      ? ['resume', stored.token]
      : null
    : joinToken
      ? ['bearer', joinToken]
      : null;
  const usedResumeAtConnect = Boolean(stored);
  if (!initialProtocols) {
    return Promise.reject(new Error('Missing token for WebSocket connection'));
  }
  const gameWs = new WebSocket(resolvedUrl, initialProtocols as unknown as string[]);

  return await new Promise<OnlineClient>((resolve, reject) => {
    let settled = false;
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      debugLog('[OnlineGame] WebSocket failed before open:', reason);
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
        // If we tried resume-first and the socket closed pre-open, do not fall back to join.
        // Clear any stale tokens and surface a specific message.
        if (usedResumeAtConnect) clearResumeForRoom(roomIdentifier);
        fail(new Error(`WebSocket closed (${evt.code})`));
      }
      if (PERMANENT_CLOSE_CODES.has(evt.code)) {
        clearResumeForRoom(roomIdentifier);
        fail(new Error(`WebSocket closed (${evt.code})`));
      }
    });

    gameWs.addEventListener('open', () => {
      settled = true;
      debugLog('[OnlineGame] WebSocket connection opened');

      let lastSentAxis = 0;
      const snapshotListeners = new Set<
        (s: GameState, ev: FrameEvents, m?: MatchSnapshot) => void
      >();
      const opponentAxisListeners = new Set<(axis: number) => void>();
      const roomStateListeners = new Set<(state: RoomStateMessage) => void>();
      const startListeners = new Set<(payload: StartSignal) => void>();
      const opponentDisconnectedListeners = new Set<(gracePeriodMs: number) => void>();
      const opponentReconnectedListeners = new Set<() => void>();
      const matchEndListeners = new Set<
        (reason: string, winner?: 'east' | 'west', summary?: OnlineMatchSummary | null) => void
      >();
      const latencyListeners = new Set<(sample: { rttMs: number; avgMs: number }) => void>();
      const startResolvers: Array<(payload: StartSignal) => void> = [];
      let startPayload: StartSignal | null = null;
      let pingInterval: number | null = null;
      let smoothedLatencyMs = 80;

      // Fan-out helper so listeners and awaiting promises see the same START payload.
      const notifyStart = (payload: StartSignal) => {
        startPayload = payload;
        startListeners.forEach((cb) => cb(payload));
        while (startResolvers.length) {
          const resolveStart = startResolvers.shift();
          resolveStart?.(payload);
        }
      };

      // Fan-out helper to keep snapshot/opponent-axis listeners in sync.
      const fanOutFrame = (payload: {
        state?: GameState;
        events?: FrameEvents;
        match?: MatchSnapshot;
        axis?: number;
      }) => {
        const { state, events, match, axis } = payload;
        if (!state) return;
        snapshotListeners.forEach((cb) => cb(state, events ?? {}, match));
        if (typeof axis === 'number') {
          opponentAxisListeners.forEach((cb) => cb(axis));
        }
      };

      // Track the currently active socket so we can swap it during reconnects.
      let ws: WebSocket = gameWs;

      // Latest resume token from server (fresh for this connection).
      // If we connected with a resume token, that one is consumed; wait for rotation.
      let latestResume: { token: string; expSec: number } | null = usedResumeAtConnect
        ? null
        : (stored ?? null);
      let hasFreshResumeToken = Boolean(latestResume);

      // Decode JWT payload safely (base64url), return exp as seconds if present.
      const readJwtExp = readJwtExpSec;

      // Will be assigned after the reconnector is created
      let onCloseAfterOpen: (evt: CloseEvent) => void = () => {};

      const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

      const attachHandlers = (socket: WebSocket) => {
        socket.addEventListener('message', onMessage);
        socket.addEventListener('close', onCloseAfterOpen);
      };

      const detachHandlers = (socket: WebSocket) => {
        socket.removeEventListener('message', onMessage as any);
        socket.removeEventListener('close', onCloseAfterOpen as any);
      };

      const stopPingLoop = () => {
        if (pingInterval !== null && typeof window !== 'undefined') {
          window.clearInterval(pingInterval);
          pingInterval = null;
        }
      };

      const startPingLoop = (socket: WebSocket) => {
        if (typeof window === 'undefined') return;
        stopPingLoop();
        const sendPing = () => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'ping',
                clientSentAt: nowMs(),
              }),
            );
          }
        };
        sendPing();
        pingInterval = window.setInterval(sendPing, 2000);
      };

      const notifyLatency = (sample: { rttMs: number; avgMs: number }) => {
        smoothedLatencyMs = sample.avgMs;
        latencyListeners.forEach((cb) => {
          try {
            cb(sample);
          } catch {}
        });
      };

      const onMessage = (ev: MessageEvent) => {
        let data: GameServerControlMessage;
        try {
          data = JSON.parse(ev.data as string);
        } catch (err) {
          debugLog('[OnlineGame] Failed to parse message', err);
          return;
        }

        switch (data.type) {
          case 'FRAME':
            fanOutFrame(data);
            break;
          case 'PONG': {
            const now = nowMs();
            const sentAt = typeof data.clientSentAt === 'number' ? data.clientSentAt : now;
            const rtt = Math.max(0, now - sentAt);
            const nextLatency = smoothedLatencyMs * 0.7 + rtt * 0.3;
            notifyLatency({ rttMs: rtt, avgMs: nextLatency });
            break;
          }
          case 'ROOM_STATE':
            debugLog('[OnlineGame] Room state message', data);
            roomStateListeners.forEach((cb) => cb(data as RoomStateMessage));
            // If we rejoined mid-match (or server won't resend START), synthesize a START
            // from the room state so awaitStart() can resolve and the game can bootstrap.
            try {
              const rs = data as RoomStateMessage;
              if (!startPayload && (rs.state === 'READY' || rs.state === 'PLAYING')) {
                const payload: StartSignal = {
                  startAtEpochMs:
                    typeof rs.startAtEpochMs === 'number' ? rs.startAtEpochMs : Date.now(),
                  randomSeed: typeof rs.randomSeed === 'number' ? rs.randomSeed : cfg.randomSeed,
                  tickRateHz:
                    typeof rs.tickRateHz === 'number' ? rs.tickRateHz : CLIENT_TICK_RATE_HZ,
                };
                notifyStart(payload);
              }
            } catch {
              // best-effort only
            }
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
              players: startMsg.players,
            };
            notifyStart(payload);
            break;
          case 'OPPONENT_DISCONNECTED':
            debugLog('[OnlineGame] Opponent disconnected, grace period:', data.gracePeriodMs);
            opponentDisconnectedListeners.forEach((cb) => cb(data.gracePeriodMs));
            break;
          case 'OPPONENT_RECONNECTED':
            debugLog('[OnlineGame] Opponent reconnected');
            opponentReconnectedListeners.forEach((cb) => cb());
            break;
          case 'MATCH_END':
            debugLog('[OnlineGame] Match ended:', data.reason, data.winner);
            matchEndListeners.forEach((cb) => cb(data.reason, data.winner, data.summary ?? null));
            // Clear stored resume tokens for this room to avoid stale entries after match end.
            clearResumeForRoom(roomIdentifier);
            stopPingLoop();
            // If match ended due to an explicit forfeit, stop reconnection attempts.
            if (data.reason === 'forfeit') {
              stopReconnector();
            }
            break;
          case 'RESUME_TOKEN':
            // Keep the latest token and decode its expiration.
            const token = String(data.token || '');
            const expSec = readJwtExp(token);
            if (expSec) {
              latestResume = { token, expSec };
              hasFreshResumeToken = true;
            }
            // Persist token for page refresh within grace window.
            saveResumeTokenToSession(token, roomIdentifier, {
              isTournament: data.isTournament ?? false,
              tournamentId: data.tournamentId,
            });
            break;
          default:
            debugLog('[OnlineGame] Unknown message type');
            break;
        }
      };

      // Install reconnector logic
      const { onCloseAfterOpen: _onCloseAfterOpen, stop: stopReconnector } = createReconnector({
        resolvedUrl,
        isPermanentClose: (code) => PERMANENT_CLOSE_CODES.has(code),
        getLatestResume: () => (hasFreshResumeToken ? latestResume : null),
        getWs: () => ws,
        setWs: (next) => {
          ws = next;
        },
        attachHandlers,
        detachHandlers,
        onPermanentClose: () => {
          matchEndListeners.forEach((cb) => cb('connection_closed', undefined, null));
          clearResumeForRoom(roomIdentifier);
        },
        onResumeAccepted: () => {
          // The token we just used is now consumed; wait for the next rotation.
          hasFreshResumeToken = false;
          latestResume = null;
          clearResumeForRoom(roomIdentifier);
        },
        onResumeOpen: (next) => {
          notifySelfReconnected(3000);
          startPingLoop(next);
        },
        onResumeGiveUp: (reason) => {
          debugLog('[OnlineGame] Resume reconnect gave up:', reason);
          hasFreshResumeToken = false;
          latestResume = null;
          clearResumeForRoom(roomIdentifier);
          stopPingLoop();
        },
      });
      onCloseAfterOpen = _onCloseAfterOpen;

      // Attach handlers for the initial socket.
      attachHandlers(ws);
      startPingLoop(ws);

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
        onOpponentDisconnected(cb) {
          opponentDisconnectedListeners.add(cb);
        },
        onOpponentReconnected(cb) {
          opponentReconnectedListeners.add(cb);
        },
        onMatchEnd(cb) {
          matchEndListeners.add(cb);
        },
        onSelfReconnected(cb) {
          selfReconnectedListeners.add(cb);
        },
        onLatencyMeasured(cb) {
          latencyListeners.add(cb);
        },
        sendLocalAxis(axis: number) {
          if (axis === lastSentAxis) return;
          lastSentAxis = axis;
          // Send axis update to server
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'axis', axis }));
        },
        forfeit() {
          try {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'forfeit' }));
            // After forfeiting, we don't want to allow resume.
            debugLog('[OnlineGame] Clearing resume token');
            clearResumeForRoom(roomIdentifier);
          } catch {}
        },
        disconnect() {
          debugLog('[OnlineGame] Disconnecting WebSocket');
          stopReconnector();
          stopPingLoop();
          startResolvers.length = 0;
          startListeners.clear();
          roomStateListeners.clear();
          snapshotListeners.clear();
          opponentAxisListeners.clear();
          opponentDisconnectedListeners.clear();
          opponentReconnectedListeners.clear();
          matchEndListeners.clear();
          latencyListeners.clear();
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        },
      };

      resolve(client);
    });
  });
}

// Exported helpers for UI layer
// re-exports moved to import section
const selfReconnectedListeners = new Set<(delayMs: number) => void>();
const notifySelfReconnected = (delayMs: number) => {
  selfReconnectedListeners.forEach((cb) => {
    try {
      cb(delayMs);
    } catch {}
  });
};
