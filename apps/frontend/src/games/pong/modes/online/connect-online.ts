import type { GameState } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import type { RoomStateMessage, StartMessage } from '@pong/shared/protocol/net';
import type { PlayerSeat } from '@pong/render';
import { wsUrl } from '../../../../utils/url';

// Render/update cadence we expect from the authoritative node.
const CLIENT_TICK_RATE_HZ = 60;

export type StartSignal = {
  startAtEpochMs: number;
  randomSeed: number;
  tickRateHz: number;
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
  onMatchEnd(cb: (reason: string, winner?: 'east' | 'west') => void): void;
};

export type ConnectConfig = {
  serverUrl: string;
  matchId: string;
  roomIdentifier: string;
  seat: PlayerSeat;
  joinToken: string;
  randomSeed: number;
};

// Resolve this with your WebSocket/RTC layer (gateway today, potentially RTC later).
export async function connectOnline(cfg: ConnectConfig): Promise<OnlineClient> {
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
      const opponentDisconnectedListeners = new Set<(gracePeriodMs: number) => void>();
      const opponentReconnectedListeners = new Set<() => void>();
      const matchEndListeners = new Set<(reason: string, winner?: 'east' | 'west') => void>();
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
            matchEndListeners.forEach((cb) => cb(data.reason, data.winner));
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
        onOpponentDisconnected(cb) {
          opponentDisconnectedListeners.add(cb);
        },
        onOpponentReconnected(cb) {
          opponentReconnectedListeners.add(cb);
        },
        onMatchEnd(cb) {
          matchEndListeners.add(cb);
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
          opponentDisconnectedListeners.clear();
          opponentReconnectedListeners.clear();
          matchEndListeners.clear();
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
