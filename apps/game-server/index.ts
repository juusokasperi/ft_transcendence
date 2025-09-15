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

dotenv.config();

const PORT = Number(process.env.GAME_SERVER_PORT || 55555);

interface Player {
  socket: WebSocket;
  seat: 'P1' | 'P2';
  axis: number;
}

interface Match {
  id: string;
  players: { P1?: Player; P2?: Player };
  state: GameState;
  controller: ReturnType<typeof createMatchController>;
  loop?: NodeJS.Timeout;
  lastEvents: FrameEvents;
}

const wss = new WebSocketServer({ port: PORT });
const matches = new Map<string, Match>();

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
  match.state = serveFrom('east', match.state);
  match.state = { ...match.state, tPauseBtwPointsMs: 0 };
  match.loop = setInterval(() => {
    const dt = 1 / 60;
    const intent = {
      leftAxis: match.players.P1?.axis ?? 0,
      rightAxis: match.players.P2?.axis ?? 0,
    };
    match.state = stepPaddles(match.state, intent, dt);
    const stepped = handleSteps(match.state, dt);
    const mc = match.controller.afterPhysicsStep(stepped.next);
    match.state = mc.state;
    match.lastEvents = { ...stepped.events, ...mc.events };
    broadcast(match, { type: 'snapshot', state: match.state, events: match.lastEvents });
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
  match.players.P1?.socket.send(msg);
  match.players.P2?.socket.send(msg);
}

wss.on('connection', (socket, req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const matchId = url.pathname.replace(/^\//, '') || 'default';
  const seat = (url.searchParams.get('seat') as 'P1' | 'P2') || 'P1';

  let match = matches.get(matchId);
  if (!match) {
    const bounds = createBounds();
    const rules = tableTennisRules();
    const controller = createMatchController(bounds, rules, 'east');
    match = {
      id: matchId,
      players: {},
      state: createInitialState(bounds, 'east'),
      controller,
      lastEvents: {},
    };
    matches.set(matchId, match);
  }

  const player: Player = { socket, seat, axis: 0 };
  match.players[seat] = player;

  socket.on('message', (raw: RawData) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'axis') {
        player.axis = Number(data.axis) || 0;
      }
    } catch {
      // ignore malformed
    }
  });

  socket.on('close', () => {
    if (match) {
      delete match.players[seat];
      if (!match.players.P1 && !match.players.P2) {
        if (match.loop) clearInterval(match.loop);
        matches.delete(matchId);
      }
    }
  });

  if (match.players.P1 && match.players.P2) {
    startMatch(match);
  }
});

console.log(`Game server listening on ws://localhost:${PORT}`);