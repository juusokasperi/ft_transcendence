import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import {
  stepPaddles,
  handleSteps,
  createMatchController,
  tableTennisRules,
  serveFrom,
  type GameState,
} from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot, TableEnd } from '@pong/shared';
import { pickInitialServer } from '@pong/shared';
import { createHttpServer } from './utils/httpServer.ts';
import { verifyJoinToken } from '@pong/shared/auth/tokenSign';
import type { RoomState } from '@pong/shared/protocol/net';

dotenv.config();

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'fix-this';
const HTTP_PORT = Number(process.env.HTTP_PORT || 55554);
const PORT = Number(process.env.GAME_SERVER_PORT || 55553);
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_HOST || '';
if (!REDIS_URL) throw new Error('Missing env: REDIS_URL');

// Authoritative tick cadence and minimum delay after both players connect to
// give clients time to establish their sockets and prep their scenes.
const TICK_RATE_HZ = 60;
const MIN_START_DELAY_MS = 1500;

const redis = new Redis(REDIS_URL);
interface Player {
  socket: WebSocket;
  seat: 'P1' | 'P2';
  axis: number;
  playerIdentifier: string;
  tokenJti: string;
}

type RoomReservation = {
  roomIdentifier: string;
  idempotencyKey: string;
  capacity: number;
  joinDeadlineAtEpochMs: number;
  randomSeed: number;
  simulationStartTick: number;
  expectedPlayers: Map<
    string,
    {
      side: 'west' | 'east';
      seat: 'P1' | 'P2';
      joined: boolean;
    }
  >;
  consumedJtis: Set<string>;
};

// Merge physics FX events with controller flow events for a single payload.
type ControllerEvents = ReturnType<
  ReturnType<typeof createMatchController>['afterPhysicsStep']
>['events'];
type ServerEvents = FrameEvents & ControllerEvents;

export interface Match {
  id: string;
  players: { P1?: Player; P2?: Player };
  state: GameState;
  controller: ReturnType<typeof createMatchController>;
  loop?: NodeJS.Timeout;
  startTimeout?: NodeJS.Timeout;
  startAtEpochMs?: number;
  started: boolean;
  initialServer: TableEnd;
  lastEvents: ServerEvents;
  lastMatch?: MatchSnapshot;
  reservation: RoomReservation;
}

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
const matches = new Map<string, Match>();
const rooms = new Map<string, RoomReservation>();

const seatForSide = (side: 'west' | 'east'): 'P1' | 'P2' => (side === 'east' ? 'P1' : 'P2');

createHttpServer({
  ADMIN_SECRET,
  HTTP_PORT,
  matches,
  onCreateRoom: async (body) => {
    const {
      idempotencyKey,
      roomIdentifier,
      capacity,
      expectedPlayers,
      randomSeed,
      simulationStartTick,
      joinDeadlineAtEpochMs,
    } = body as {
      idempotencyKey?: string;
      roomIdentifier?: string;
      capacity?: number;
      expectedPlayers?: Array<{ playerIdentifier: string; side: 'west' | 'east' }>;
      randomSeed?: number;
      simulationStartTick?: number;
      joinDeadlineAtEpochMs?: number;
    };

    if (!idempotencyKey || !roomIdentifier) {
      throw new Error('Missing idempotencyKey or roomIdentifier');
    }
    if (!Array.isArray(expectedPlayers) || expectedPlayers.length === 0) {
      throw new Error('expectedPlayers must be a non-empty array');
    }
    if (typeof capacity !== 'number' || capacity < expectedPlayers.length) {
      throw new Error('Invalid capacity');
    }
    if (rooms.has(roomIdentifier)) {
      return { status: 'exists' };
    }

    const expected = new Map<
      string,
      { side: 'west' | 'east'; seat: 'P1' | 'P2'; joined: boolean }
    >();
    for (const p of expectedPlayers) {
      if (!p?.playerIdentifier || (p.side !== 'west' && p.side !== 'east')) {
        throw new Error('Invalid expected player payload');
      }
      expected.set(p.playerIdentifier, {
        side: p.side,
        seat: seatForSide(p.side),
        joined: false,
      });
    }

    rooms.set(roomIdentifier, {
      roomIdentifier,
      idempotencyKey,
      capacity,
      joinDeadlineAtEpochMs: joinDeadlineAtEpochMs ?? Date.now() + 15_000,
      randomSeed: randomSeed ?? Math.floor(Math.random() * 0x100000000),
      simulationStartTick: simulationStartTick ?? Date.now(),
      expectedPlayers: expected,
      consumedJtis: new Set<string>(),
    });

    return { status: 'room registered' };
  },
});

function resolveRoomState(match: Match): RoomState {
  if (match.started) return 'PLAYING';
  return match.players.P1 && match.players.P2 ? 'READY' : 'WAITING_FOR_OPPONENT';
}

function broadcastRoomState(match: Match, override?: RoomState) {
  const state = override ?? resolveRoomState(match);
  const base = {
    type: 'ROOM_STATE' as const,
    roomIdentifier: match.id,
    state,
    startAtEpochMs: match.reservation.simulationStartTick,
    randomSeed: match.reservation.randomSeed,
    tickRateHz: TICK_RATE_HZ,
  };

  (['P1', 'P2'] as const).forEach((seat) => {
    const player = match.players[seat];
    if (!player) return;
    player.socket.send(
      JSON.stringify({
        ...base,
        seat,
      }),
    );
  });
}

function scheduleMatchStart(match: Match) {
  if (match.started) return;
  const now = Date.now();
  const target = Math.max(match.reservation.simulationStartTick, now + MIN_START_DELAY_MS);
  match.reservation.simulationStartTick = target;
  match.startAtEpochMs = target;
  const payload = {
    type: 'START' as const,
    roomIdentifier: match.id,
    startAtEpochMs: target,
    randomSeed: match.reservation.randomSeed,
    tickRateHz: TICK_RATE_HZ,
  };

  console.log(
    `[GameServer] Scheduling start for room ${match.id} at ${new Date(target).toISOString()} (in ${Math.max(
      0,
      target - now,
    )}ms)`,
  );

  (['P1', 'P2'] as const).forEach((seat) => {
    const player = match.players[seat];
    if (player) player.socket.send(JSON.stringify(payload));
  });

  if (match.startTimeout) clearTimeout(match.startTimeout);
  const delay = Math.max(0, target - now);
  match.startTimeout = setTimeout(() => {
    match.startTimeout = undefined;
    startMatch(match);
  }, delay);

  broadcastRoomState(match, 'READY');

  console.log(`[GameServer] Publishing to redis 'room_ready' ${match.id}`);
  redis.publish(
    'room_ready',
    JSON.stringify({
      roomIdentifier: match.id,
    }),
  );
}

function createBounds(): GameState['bounds'] {
  return {
    halfLengthX: 1.37,
    halfWidthZ: 0.7625,
    paddleHalfDepthZ: 0.075,
    leftPaddleX: -1.37,
    rightPaddleX: 1.37,
    ballRadius: 0.02,
  };
}

function startMatch(match: Match) {
  if (match.started) return;
  if (!match.players.P1 || !match.players.P2) {
    console.warn('[GameServer] Cannot start match, missing players', {
      roomIdentifier: match.id,
    });
    return;
  }
  match.started = true;
  if (match.loop) return;
  console.log(`[GameServer] Starting match ${match.id}`);
  const initialServer = match.initialServer;
  match.state = serveFrom(initialServer, match.state);
  match.state = { ...match.state, tPauseBtwPointsMs: 0 };
  broadcastRoomState(match, 'PLAYING');

  match.loop = setInterval(() => {
    const dt = 1 / TICK_RATE_HZ;
    // Route seat inputs to physical sides based on current occupancy.
    // By convention in game-logic, P1 paddle channel = LEFT (east), P2 = RIGHT (west).
    const leftSeat = match.state.playerAtEnd.east; // 'P1' | 'P2'
    const rightSeat = match.state.playerAtEnd.west; // 'P1' | 'P2'
    const intent = {
      leftAxis: match.players[leftSeat]?.axis ?? 0,
      rightAxis: match.players[rightSeat]?.axis ?? 0,
    };
    match.state = stepPaddles(match.state, intent, dt);
    const stepped = handleSteps(match.state, dt);
    const mc = match.controller.afterPhysicsStep(stepped.next);
    match.state = mc.state;
    match.lastEvents = { ...stepped.events, ...mc.events };
    match.lastMatch = match.controller.getSnapshot();
    broadcast(match, {
      type: 'snapshot',
      state: match.state,
      events: match.lastEvents,
      match: match.lastMatch,
    });
    // Opponent axis echo for simple prediction
    if (match.players.P1)
      match.players.P1.socket.send(
        JSON.stringify({ type: 'opponentAxis', axis: match.players.P2?.axis ?? 0 }),
      );
    if (match.players.P2)
      match.players.P2.socket.send(
        JSON.stringify({ type: 'opponentAxis', axis: match.players.P1?.axis ?? 0 }),
      );
  }, 1000 / TICK_RATE_HZ);
}

function broadcast(match: Match, payload: any) {
  const msg = JSON.stringify(payload);
  //console.log(`[GameServer] Broadcasting to match ${match.id}:`, payload);
  match.players.P1?.socket.send(msg);
  match.players.P2?.socket.send(msg);
}

wss.on('connection', (socket, req) => {
  (async () => {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathMatch = url.pathname.match(/^\/g\/([a-zA-Z0-9_-]+)/);
    const roomIdentifier = pathMatch?.[1];
    if (!roomIdentifier) {
      console.warn('[GameServer] Connection without valid room path', req.url);
      socket.close(4404, 'room-not-found');
      return;
    }
    const protocolHeader = req.headers['sec-websocket-protocol'];
    if (typeof protocolHeader !== 'string') {
      console.warn('[GameServer] Missing subprotocol header for room', roomIdentifier);
      socket.close(4401, 'missing-token');
      return;
    }
    const requestedProtocols = protocolHeader
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const bearerIndex = requestedProtocols.findIndex((p) => p.toLowerCase() === 'bearer');
    const joinToken = bearerIndex !== -1 ? requestedProtocols[bearerIndex + 1] : undefined;
    if (!joinToken) {
      console.warn('[GameServer] Missing join token protocol for room', roomIdentifier);
      socket.close(4401, 'missing-token');
      return;
    }

    const claims = verifyJoinToken(joinToken);
    if (
      !claims ||
      claims.roomIdentifier !== roomIdentifier ||
      claims.aud !== 'game-node' ||
      claims.iss !== 'mm'
    ) {
      console.warn('[GameServer] Invalid join token for room', roomIdentifier);
      socket.close(4401, 'invalid-token');
      return;
    }

    const redisKey = `join-token:${claims.jti}`;
    try {
      const exists = await redis.exists(redisKey);
      if (!exists) {
        console.warn('[GameServer] Join token not registered or already consumed', {
          roomIdentifier,
          jti: claims.jti,
        });
        socket.close(4403, 'token-reused');
        return;
      }
    } catch (err) {
      console.error('[GameServer] Failed to check join token state', err);
      socket.close(1011, 'server-error');
      return;
    }
    const reservation = rooms.get(roomIdentifier);
    if (!reservation) {
      console.warn('[GameServer] No reservation found for room', roomIdentifier);
      socket.close(4404, 'room-not-found');
      return;
    }

    if (Date.now() > reservation.joinDeadlineAtEpochMs) {
      console.warn('[GameServer] Join deadline exceeded for room', roomIdentifier);
      socket.close(4408, 'join-window-expired');
      return;
    }

    if (reservation.consumedJtis.has(claims.jti)) {
      console.warn('[GameServer] Token replay detected for room', roomIdentifier);
      socket.close(4403, 'token-reused');
      return;
    }

    const expected = reservation.expectedPlayers.get(claims.sub);
    if (!expected) {
      console.warn('[GameServer] Unexpected player attempted to join', {
        roomIdentifier,
        player: claims.sub,
      });
      socket.close(4403, 'player-not-authorized');
      return;
    }
    if (expected.side !== claims.side) {
      console.warn('[GameServer] Side mismatch for player', {
        roomIdentifier,
        player: claims.sub,
        expectedSide: expected.side,
        tokenSide: claims.side,
      });
      socket.close(4403, 'side-mismatch');
      return;
    }
    if (expected.joined) {
      console.warn('[GameServer] Seat already occupied', {
        roomIdentifier,
        seat: expected.seat,
        player: claims.sub,
      });
      socket.close(4402, 'seat-occupied');
      return;
    }

    let match = matches.get(roomIdentifier);
    if (!match) {
      console.log(`[GameServer] Creating new match for room ${roomIdentifier}`);
      const bounds = createBounds();
      const rules = tableTennisRules();
      const initialServer = pickInitialServer(reservation.randomSeed);
      const controller = createMatchController(bounds, rules, initialServer);
      match = {
        id: roomIdentifier,
        players: {},
        state: controller.getGame(),
        controller,
        startTimeout: undefined,
        startAtEpochMs: undefined,
        started: false,
        initialServer,
        lastEvents: {},
        reservation,
      };
      matches.set(roomIdentifier, match);
    }

    const seat = expected.seat;
    if (match.players[seat]) {
      console.warn('[GameServer] Match seat already taken at runtime', {
        roomIdentifier,
        seat,
        player: claims.sub,
      });
      socket.close(4402, 'seat-occupied');
      return;
    }
    const player: Player = {
      socket,
      seat,
      axis: 0,
      playerIdentifier: claims.sub,
      tokenJti: claims.jti,
    };
    match.players[seat] = player;
    expected.joined = true;
    reservation.consumedJtis.add(claims.jti);

    console.log(
      `[GameServer] Player joined room=${roomIdentifier} seat=${seat} player=${claims.sub}`,
    );

    broadcastRoomState(match);

    socket.on('message', (raw: RawData) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'axis') {
          player.axis = Number(data.axis) || 0;
        }
      } catch {
        console.warn('[GameServer] Malformed message', {
          roomIdentifier,
          seat,
        });
      }
    });

    socket.on('close', () => {
      console.log(`[GameServer] Player disconnected room=${roomIdentifier} seat=${seat}`);
      const currentMatch = matches.get(roomIdentifier);
      const reservationForRoom = rooms.get(roomIdentifier);
      if (reservationForRoom) {
        const expectedPlayer = reservationForRoom.expectedPlayers.get(player.playerIdentifier);
        if (expectedPlayer) expectedPlayer.joined = false;
      }
      if (currentMatch) {
        delete currentMatch.players[seat];
        if (!currentMatch.players.P1 || !currentMatch.players.P2) {
          if (currentMatch.startTimeout) {
            clearTimeout(currentMatch.startTimeout);
            currentMatch.startTimeout = undefined;
          }
          if (currentMatch.loop) {
            clearInterval(currentMatch.loop);
            currentMatch.loop = undefined;
            console.log(`[GameServer] Pausing match ${roomIdentifier} waiting for opponent`);
            // Inform remaining player that opponent disconnected and match is paused?
            // Check what the client does with this...
            // Review Juuso and Iurii
          }
          currentMatch.startAtEpochMs = undefined;
          currentMatch.started = false;
        }
        if (!currentMatch.players.P1 && !currentMatch.players.P2) {
          if (currentMatch.loop) {
            clearInterval(currentMatch.loop);
            console.log(`[GameServer] Match ${roomIdentifier} ended and cleaned up`);
          }
          matches.delete(roomIdentifier);
          rooms.delete(roomIdentifier);
          return;
        }
        broadcastRoomState(currentMatch);
      }
    });

    if (match.players.P1 && match.players.P2) {
      console.log(
        `[GameServer] Both players connected for room ${roomIdentifier}, scheduling start`,
      );
      scheduleMatchStart(match);
    }
  })().catch((err) => {
    console.error('[GameServer] Unexpected error during connection flow', err);
    try {
      socket.close(1011, 'server-error');
    } catch {
      /* ignore */
    }
  });
});

console.log(`Game server listening on ws://localhost:${PORT}`);
