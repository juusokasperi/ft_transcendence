import type { GameState } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import type { OnlineMatchSummary, RoomStateMessage, StartMessage } from '@pong/shared/protocol/net';
import type { PlayerSeat } from '@pong/render';
import { wsUrl } from '../../../../utils/url';
import { readJwtExpSec, clearResumeForRoom, saveResumeTokenToSession } from './resume';
import { suppressAutoResumeFor } from './resume';
export {
  getStoredResumeCandidate,
  clearStoredResumeTokens,
  findAnyStoredResumeCandidate,
} from './resume';
import { createReconnector } from './reconnect';

// Render/update cadence we expect from the authoritative node.
const CLIENT_TICK_RATE_HZ = 60;

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
  // If caller provided a resume candidate, try resume-first; else fall back to join.
  const stored = options.resumeCandidate ?? null;
  const initialProtocols = stored
    ? (['resume', stored.token] as const)
    : (['bearer', joinToken] as const);
  const usedResumeAtConnect = Boolean(stored);
  const gameWs = new WebSocket(resolvedUrl, initialProtocols as unknown as string[]);

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
        // If we tried resume-first and the socket closed pre-open, do not fall back to join.
        // Clear any stale tokens and surface a specific message.
        if (usedResumeAtConnect) clearResumeForRoom(roomIdentifier);
        fail(new Error(`WebSocket closed (${evt.code})`));
      }
    });

    gameWs.addEventListener('open', () => {
      settled = true;
      console.log('[OnlineGame] WebSocket connection opened');

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

      // Track the currently active socket so we can swap it during reconnects.
      let ws: WebSocket = gameWs;

      // Latest resume token from server. Decoded exp guides reconnect cutoff.
      let latestResume: { token: string; expSec: number } | null = stored ?? null;

      // Decode JWT payload safely (base64url), return exp as seconds if present.
      const readJwtExp = readJwtExpSec;

      // Will be assigned after the reconnector is created
      let onCloseAfterOpen: (evt: CloseEvent) => void = () => {};

      const attachHandlers = (socket: WebSocket) => {
        socket.addEventListener('message', onMessage);
        socket.addEventListener('close', onCloseAfterOpen);
      };

      const detachHandlers = (socket: WebSocket) => {
        socket.removeEventListener('message', onMessage as any);
        socket.removeEventListener('close', onCloseAfterOpen as any);
      };

      const onMessage = (ev: MessageEvent) => {
        let data: any;
        try {
          data = JSON.parse(ev.data as string);
        } catch (err) {
          console.warn('[OnlineGame] Failed to parse message', err);
          return;
        }

        switch (data.type) {
          case 'FRAME':
            snapshotListeners.forEach((cb) => cb(data.state, data.events, data.match));
            opponentAxisListeners.forEach((cb) => cb(data.axis));
            break;
          case 'ROOM_STATE':
            console.debug('[OnlineGame] Room state message', data);
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
            console.log('[OnlineGame] Opponent disconnected, grace period:', data.gracePeriodMs);
            opponentDisconnectedListeners.forEach((cb) => cb(data.gracePeriodMs));
            break;
          case 'OPPONENT_RECONNECTED':
            console.log('[OnlineGame] Opponent reconnected');
            opponentReconnectedListeners.forEach((cb) => cb());
            break;
          case 'MATCH_END':
            console.log('[OnlineGame] Match ended:', data.reason, data.winner);
            matchEndListeners.forEach((cb) => cb(data.reason, data.winner, data.summary ?? null));
            // Clear stored resume tokens for this room to avoid stale entries after match end.
            clearResumeForRoom(roomIdentifier);
            // If match ended due to an explicit forfeit, suppress auto-resume briefly
            // so the winner doesn't get pulled back into a dead session.
            if (data.reason === 'forfeit') {
              try {
                suppressAutoResumeFor(7000);
              } catch {}
            }
            break;
          case 'RESUME_TOKEN':
            // Keep the latest token and decode its expiration.
            const token = String(data.token || '');
            const expSec = readJwtExp(token);
            if (expSec) latestResume = { token, expSec };
            // Persist token for page refresh within grace window.
            saveResumeTokenToSession(token, roomIdentifier);
            console.log('[OnlineGame] Resume token received', {
              hasToken: Boolean(token),
              expSec,
            });
            break;
          default:
            console.warn('[OnlineGame] Unknown message type:', data.type);
            break;
        }
      };

      // Install reconnector logic
      const { onCloseAfterOpen: _onCloseAfterOpen, stop: stopReconnector } = createReconnector({
        resolvedUrl,
        getLatestResume: () => latestResume,
        getWs: () => ws,
        setWs: (next) => {
          ws = next;
        },
        attachHandlers,
        detachHandlers,
        onResumeOpen: () => notifySelfReconnected(3000),
      });
      onCloseAfterOpen = _onCloseAfterOpen;

      // Attach handlers for the initial socket.
      attachHandlers(ws);

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
        sendLocalAxis(axis: number) {
          if (axis === lastSentAxis) return;
          lastSentAxis = axis;
          // Send axis update to server
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'axis', axis }));
        },
        forfeit() {
          try {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'forfeit' }));
          } catch {}
        },
        disconnect() {
          console.log('[OnlineGame] Disconnecting WebSocket');
          stopReconnector();
          startResolvers.length = 0;
          startListeners.clear();
          roomStateListeners.clear();
          snapshotListeners.clear();
          opponentAxisListeners.clear();
          opponentDisconnectedListeners.clear();
          opponentReconnectedListeners.clear();
          matchEndListeners.clear();
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
