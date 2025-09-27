import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import dotenv from 'dotenv';
import {
  createInitialState,
  stepPaddles,
  handleSteps,
  createMatchController,
  tableTennisRules,
  serveFrom,
  type GameState,
} from '@pong/game-logic';
import type { FrameEvents } from '@pong/shared';
import type { MatchSnapshot } from '@pong/shared';
import { createHttpServer } from './utils/httpServer.ts';

dotenv.config();

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'fix-this';
const HTTP_PORT = Number(process.env.HTTP_PORT || 55554);
const PORT = Number(process.env.GAME_SERVER_PORT || 55553);

interface Player {
  socket: WebSocket;
  seat: 'P1' | 'P2';
  axis: number;
}

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
  lastEvents: ServerEvents;
  lastMatch?: MatchSnapshot;
}

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
const matches = new Map<string, Match>();

createHttpServer({
  ADMIN_SECRET,
  HTTP_PORT,
  matches,
  onCreateRoom: async (body) => {
    // createroomlogic...
    return { status: 'room created' };
  },
});

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
  if (match.loop) return;
  console.log(`[GameServer] Starting match ${match.id}`);
  match.state = serveFrom('east', match.state);
  match.state = { ...match.state, tPauseBtwPointsMs: 0 };
  match.loop = setInterval(() => {
    const dt = 1 / 60;
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
  }, 1000 / 60);
}

function broadcast(match: Match, payload: any) {
  const msg = JSON.stringify(payload);
  //console.log(`[GameServer] Broadcasting to match ${match.id}:`, payload);
  match.players.P1?.socket.send(msg);
  match.players.P2?.socket.send(msg);
}

wss.on('connection', (socket, req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const matchId = url.pathname.replace(/^\//, '') || 'default';
  const seat = (url.searchParams.get('seat') as 'P1' | 'P2') || 'P1';

  console.log(`[GameServer] New connection: matchId=${matchId}, seat=${seat}`);

  let match = matches.get(matchId);
  if (!match) {
    console.log(`[GameServer] Creating new match: ${matchId}`);
    const bounds = createBounds();
    const rules = tableTennisRules();
    const controller = createMatchController(bounds, rules, 'east');
    match = {
      id: matchId,
      players: {},
      // initialize from controller to keep params/rules in sync
      state: controller.getGame(),
      controller,
      lastEvents: {},
    };
    matches.set(matchId, match);
  }

  const player: Player = { socket, seat, axis: 0 };
  match.players[seat] = player;
  console.log(`[GameServer] Player joined: seat=${seat}, matchId=${matchId}`);

  socket.on('message', (raw: RawData) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'axis') {
        player.axis = Number(data.axis) || 0;
        // Debug axis input
        // console.log(`[GameServer] Received axis from ${seat} in match ${matchId}:`, player.axis);
      }
    } catch {
      console.warn(`[GameServer] Malformed message from ${seat} in match ${matchId}`);
    }
  });

  socket.on('close', () => {
    console.log(`[GameServer] Player disconnected: seat=${seat}, matchId=${matchId}`);
    if (match) {
      delete match.players[seat];
      if (!match.players.P1 && !match.players.P2) {
        if (match.loop) {
          clearInterval(match.loop);
          console.log(`[GameServer] Match ${matchId} ended and cleaned up`);
        }
        matches.delete(matchId);
      }
    }
  });

  if (match.players.P1 && match.players.P2) {
    console.log(`[GameServer] Both players connected for match ${matchId}, starting match`);
    startMatch(match);
  }
});

console.log(`Game server listening on ws://localhost:${PORT}`);
