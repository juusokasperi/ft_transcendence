import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  stepPaddles,
  handleSteps,
  createMatchController,
  tableTennisRules,
  serveFrom,
  type GameState,
} from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot, TableEnd } from '@pong/shared';
import { pickInitialServer, SERVE_SELECT_TOTAL_MS } from '@pong/shared';
import { createHttpServer } from './utils/httpServer.ts';
import { verifyJoinToken } from '@pong/shared/auth/tokenSign';
import type { RoomState } from '@pong/shared/protocol/net';

dotenv.config();

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'fix-this';
const HTTP_PORT = Number(process.env.HTTP_PORT || 55554);
const PORT = Number(process.env.GAME_SERVER_PORT || 55553);
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_HOST || '';
const API_URL = process.env.API_URL || process.env.BACKEND_URL || 'http://backend:3001';
const MATCH_SECRET = process.env.MATCH_SECRET || 'fix-this';
if (!REDIS_URL) throw new Error('Missing env: REDIS_URL');

// Authoritative tick cadence and minimum delay after both players connect to
// give clients time to establish their sockets and prep their scenes.
const TICK_RATE_HZ = 60;
const MIN_START_DELAY_MS = 1500;
const RECONNECT_GRACE_PERIOD_MS = 10000; // 10 seconds grace period for tournament matches
const CASUAL_RECONNECT_GRACE_PERIOD_MS = 15000; // 15 seconds for casual matches

const redis = new Redis(REDIS_URL);
interface Player {
  socket: WebSocket;
  seat: 'P1' | 'P2';
  axis: number;
  playerIdentifier: string;
  tokenJti: string;
  participantId?: number;
  alias?: string;
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
      participantId?: number;
      alias?: string;
    }
  >;
  consumedJtis: Set<string>;
  tournament?: {
    tournamentId: number;
    tournamentMatchId: number;
    tournamentStage: 'semifinal' | 'final' | 'bronze';
    participants?: Array<{ participantId: number; userUuid: string; alias?: string }>;
  };
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
  resultSubmitting?: boolean;
  resultSubmitted?: boolean;
  disconnectGracePeriod?: {
    disconnectedSeat: 'P1' | 'P2';
    disconnectTime: number;
    graceTimeout?: NodeJS.Timeout;
  };
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
      tournament,
    } = body as {
      idempotencyKey?: string;
      roomIdentifier?: string;
      capacity?: number;
      expectedPlayers?: Array<{ playerIdentifier: string; side: 'west' | 'east' }>;
      randomSeed?: number;
      simulationStartTick?: number;
      joinDeadlineAtEpochMs?: number;
      tournament?: {
        tournamentId: number;
        tournamentMatchId: number;
        tournamentStage: 'semifinal' | 'final' | 'bronze';
        participants?: Array<{ participantId: number; userUuid: string; alias?: string }>;
      };
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

    const participantLookup = new Map(
      tournament?.participants?.map((p) => [p.userUuid, p]) ?? [],
    );
    const expected = new Map<
      string,
      {
        side: 'west' | 'east';
        seat: 'P1' | 'P2';
        joined: boolean;
        participantId?: number;
        alias?: string;
      }
    >();
    for (const p of expectedPlayers) {
      if (!p?.playerIdentifier || (p.side !== 'west' && p.side !== 'east')) {
        throw new Error('Invalid expected player payload');
      }
      const participant = participantLookup.get(p.playerIdentifier);
      expected.set(p.playerIdentifier, {
        side: p.side,
        seat: seatForSide(p.side),
        joined: false,
        participantId: participant?.participantId,
        alias: participant?.alias,
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
      tournament: tournament
        ? {
            tournamentId: tournament.tournamentId,
            tournamentMatchId: tournament.tournamentMatchId,
            tournamentStage: tournament.tournamentStage,
            participants: tournament.participants,
          }
        : undefined,
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
  
  // Gather player aliases from reservation
  const players: { P1?: { alias?: string }; P2?: { alias?: string } } = {};
  for (const [playerIdentifier, playerInfo] of match.reservation.expectedPlayers.entries()) {
    if (playerInfo.seat === 'P1') {
      players.P1 = { alias: playerInfo.alias };
    } else if (playerInfo.seat === 'P2') {
      players.P2 = { alias: playerInfo.alias };
    }
  }
  
  const payload = {
    type: 'START' as const,
    roomIdentifier: match.id,
    startAtEpochMs: target,
    randomSeed: match.reservation.randomSeed,
    tickRateHz: TICK_RATE_HZ,
    players,
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
  // Defer the opening serve to allow clients to run serve-selection FX.
  const gridMs = 1000 / TICK_RATE_HZ;
  const selectServeMs = Math.ceil(SERVE_SELECT_TOTAL_MS / gridMs) * gridMs;
  match.state = {
    ...match.state,
    phase: 'pauseBtwPoints',
    tPauseBtwPointsMs: selectServeMs,
    nextServe: initialServer,
    server: initialServer,
    paddles: { east: { z: 0, vz: 0 }, west: { z: 0, vz: 0 } },
    ball: { x: 0, z: 0, vx: 0, vz: 0 },
  };
  broadcastRoomState(match, 'PLAYING');

  match.loop = setInterval(() => {
    const dt = 1 / TICK_RATE_HZ;
    // Route seat inputs to physical sides based on current occupancy.
    // Game-logic uses end-keyed channels: leftAxis drives EAST, rightAxis drives WEST.
    const leftSeat = match.state.playerAtEnd.east; // 'P1' | 'P2'
    const rightSeat = match.state.playerAtEnd.west; // 'P1' | 'P2'
    const intent = {
      leftAxis: match.players[leftSeat]?.axis ?? 0,
      rightAxis: match.players[rightSeat]?.axis ?? 0,
    };
    match.state = stepPaddles(match.state, intent, dt);
    const prevPhase = match.state.phase;
    const stepped = handleSteps(match.state, dt);
    let nextState = stepped.next;
    // Quantize newly-entered between-points pauses to the server tick grid so clients
    // reliably see the pause for an integer number of snapshots.
    if (prevPhase !== 'pauseBtwPoints' && nextState.phase === 'pauseBtwPoints') {
      const grid = 1000 / TICK_RATE_HZ;
      const ms = Math.max(0, nextState.tPauseBtwPointsMs ?? 0);
      const q = Math.ceil(ms / grid) * grid;
      nextState = { ...nextState, tPauseBtwPointsMs: q };
    }
    // Quantize newly-entered between-games pauses as well
    if (prevPhase !== 'pauseBetweenGames' && nextState.phase === 'pauseBetweenGames') {
      const grid = 1000 / TICK_RATE_HZ;
      const ms = Math.max(0, nextState.tPauseBtwGamesMs ?? 0);
      const q = Math.ceil(ms / grid) * grid;
      nextState = { ...nextState, tPauseBtwGamesMs: q };
    }
    const mc = match.controller.afterPhysicsStep(nextState);
    match.state = mc.state;
    match.lastEvents = { ...stepped.events, ...mc.events };
    match.lastMatch = match.controller.getSnapshot();
    
    // Handle match completion for tournaments
    if (mc.events.matchOver && !match.resultSubmitted && !match.resultSubmitting) {
      handleMatchCompletion(match, mc.events.matchOver);
    }
    
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

async function handleDisconnectGracePeriod(match: Match, disconnectedSeat: 'P1' | 'P2') {
  const remainingSeat = disconnectedSeat === 'P1' ? 'P2' : 'P1';
  const remainingPlayer = match.players[remainingSeat];

  if (!remainingPlayer) {
    console.log(`[GameServer] No grace period needed - no remaining player`);
    return;
  }

  const isTournament = Boolean(match.reservation.tournament);
  const gracePeriodMs = isTournament ? RECONNECT_GRACE_PERIOD_MS : CASUAL_RECONNECT_GRACE_PERIOD_MS;

  // Clear any existing grace period
  if (match.disconnectGracePeriod?.graceTimeout) {
    clearTimeout(match.disconnectGracePeriod.graceTimeout);
  }

  const disconnectTime = Date.now();
  console.log(`[GameServer] Player ${disconnectedSeat} disconnected, starting ${gracePeriodMs}ms grace period (${isTournament ? 'tournament' : 'casual'})`);

  // Notify remaining player about disconnect
  remainingPlayer.socket.send(
    JSON.stringify({
      type: 'OPPONENT_DISCONNECTED',
      gracePeriodMs: gracePeriodMs,
    }),
  );
  
  console.log(`[GameServer] Sent OPPONENT_DISCONNECTED to ${remainingSeat}`);

  // Set grace period timeout
  const graceTimeout = setTimeout(async () => {
    const currentMatch = matches.get(match.id);
    if (!currentMatch || currentMatch.players[disconnectedSeat]) {
      // Player reconnected or match was cleaned up
      console.log(`[GameServer] Grace period ended, player reconnected or match cleaned up`);
      return;
    }

    console.log(`[GameServer] Grace period expired for ${disconnectedSeat}`);
    
    // Determine winner based on which seat remains
    // Need to check playerAtEnd to know which side the remaining player is on
    const playerAtEnd = currentMatch.state.playerAtEnd;
    let winnerSide: 'east' | 'west';
    
    if (playerAtEnd) {
      // Check which side the remaining player is on
      winnerSide = playerAtEnd.east === remainingSeat ? 'east' : 'west';
      console.log(`[GameServer] Player positions: east=${playerAtEnd.east}, west=${playerAtEnd.west}, remaining=${remainingSeat} -> winner side=${winnerSide}`);
    } else {
      // Fallback: assume P1=east, P2=west
      winnerSide = remainingSeat === 'P1' ? 'east' : 'west';
      console.log(`[GameServer] No playerAtEnd info, using fallback: ${remainingSeat} -> ${winnerSide}`);
    }
    
    // Award victory to remaining player for both tournament and casual matches
    console.log(`[GameServer] ${isTournament ? 'Tournament' : 'Casual'} match - awarding win to ${remainingSeat} (side: ${winnerSide}) due to opponent timeout`);
    await handleMatchCompletion(currentMatch, { winner: winnerSide });

    // Notify remaining player of match end
    if (currentMatch.players[remainingSeat]) {
      currentMatch.players[remainingSeat]!.socket.send(
        JSON.stringify({
          type: 'MATCH_END',
          reason: 'opponent_timeout',
          winner: winnerSide,
        }),
      );
    }

    // Clean up match
    if (currentMatch.loop) {
      clearInterval(currentMatch.loop);
      currentMatch.loop = undefined;
    }
    matches.delete(match.id);
    rooms.delete(match.id);
  }, gracePeriodMs);

  match.disconnectGracePeriod = {
    disconnectedSeat,
    disconnectTime,
    graceTimeout,
  };
}

function cancelDisconnectGracePeriod(match: Match) {
  if (match.disconnectGracePeriod?.graceTimeout) {
    clearTimeout(match.disconnectGracePeriod.graceTimeout);
    match.disconnectGracePeriod = undefined;
    console.log(`[GameServer] Cancelled disconnect grace period for match ${match.id}`);
  }
}

async function handleMatchCompletion(match: Match, matchOverEvent: { winner: string }) {
  match.resultSubmitting = true;
  
  try {
    // Determine which player is on which side using playerAtEnd from game state
    const playerAtEnd = match.state.playerAtEnd;
    const eastSeat = playerAtEnd.east; // 'P1' or 'P2'
    const westSeat = playerAtEnd.west; // 'P1' or 'P2'
    
    console.log(`[GameServer] Player positions at match end: east=${eastSeat}, west=${westSeat}`);
    
    // Get player info based on actual positions
    const eastPlayer = match.players[eastSeat];
    const westPlayer = match.players[westSeat];
    
    // For disconnection timeout, we need at least one player
    if (!eastPlayer && !westPlayer) {
      console.error(`[GameServer] No player data available for match ${match.id}`);
      return;
    }

    // Get player identifiers - try from active players first, then from expectedPlayers
    let eastPlayerIdentifier = eastPlayer?.playerIdentifier;
    let westPlayerIdentifier = westPlayer?.playerIdentifier;
    let eastParticipantId = eastPlayer?.participantId;
    let westParticipantId = westPlayer?.participantId;
    let eastAlias = eastPlayer?.alias;
    let westAlias = westPlayer?.alias;
    
    if (!eastPlayerIdentifier || !westPlayerIdentifier) {
      // Try to get from expectedPlayers in reservation (Map key is playerIdentifier)
      for (const [playerIdentifier, playerInfo] of match.reservation.expectedPlayers.entries()) {
        if (playerInfo.seat === eastSeat && !eastPlayerIdentifier) {
          eastPlayerIdentifier = playerIdentifier;
          eastParticipantId = playerInfo.participantId;
          eastAlias = playerInfo.alias;
        }
        if (playerInfo.seat === westSeat && !westPlayerIdentifier) {
          westPlayerIdentifier = playerIdentifier;
          westParticipantId = playerInfo.participantId;
          westAlias = playerInfo.alias;
        }
      }
    }

    if (!eastPlayerIdentifier || !westPlayerIdentifier) {
      console.error(`[GameServer] Cannot determine player identifiers for match ${match.id}`);
      return;
    }

    const gamesHistory = match.lastMatch?.gamesHistory || [];
    
    // Calculate scores from games history
    let eastScore = 0;
    let westScore = 0;
    for (const game of gamesHistory) {
      if (game.winner === 'east') eastScore++;
      else if (game.winner === 'west') westScore++;
    }

    // If no games were played but we have a winner (disconnect timeout), award technical victory
    let technicalGamesHistory = gamesHistory;
    if (eastScore === 0 && westScore === 0 && matchOverEvent.winner) {
      // Tournament matches get 3:0 technical score, casual matches get 2:0
      const technicalScore = match.reservation.tournament ? 3 : 2;
      const winner = matchOverEvent.winner as 'east' | 'west';
      
      if (winner === 'east') {
        eastScore = technicalScore;
      } else if (winner === 'west') {
        westScore = technicalScore;
      }
      
      console.log(`[GameServer] Technical victory awarded: ${winner} wins ${technicalScore}:0 (${match.reservation.tournament ? 'tournament' : 'casual'})`);
      
      // Create synthetic games history for technical victory
      technicalGamesHistory = Array.from({ length: technicalScore }, (_, i) => ({
        gameIndex: i + 1,
        east: winner === 'east' ? 11 : 0,
        west: winner === 'west' ? 11 : 0,
        winner: winner,
      }));
      
      console.log(`[GameServer] Created synthetic games history for technical victory:`, technicalGamesHistory);
    }

    // Create proper JWT token for match service authentication
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { 
        service: 'game-node', 
        iat: now,
        exp: now + 3600 // 1 hour expiry
      }, 
      MATCH_SECRET
    );

    if (match.reservation.tournament) {
      // Tournament match
      console.log(`[GameServer] Tournament match ${match.id} completed, reporting result`);
      
      const tournament = match.reservation.tournament;
      
      // Determine winner based on final scores (eastScore and westScore already calculated above)
      const actualWinner = eastScore > westScore ? 'east' : 'west';
      
      let winnerParticipantId: number;
      let loserParticipantId: number;
      
      if (actualWinner === 'east') {
        winnerParticipantId = eastParticipantId || 0;
        loserParticipantId = westParticipantId || 0;
      } else {
        winnerParticipantId = westParticipantId || 0;
        loserParticipantId = eastParticipantId || 0;
      }
      
      if (!winnerParticipantId || !loserParticipantId) {
        console.error(`[GameServer] Missing participant IDs for tournament match ${match.id}`);
        return;
      }
      
      console.log(`[GameServer] Tournament match winner: ${actualWinner} (score: ${eastScore}:${westScore}), winnerParticipantId: ${winnerParticipantId}, loserParticipantId: ${loserParticipantId}`);
      
      const resultPayload = {
        winnerParticipantId,
        loserParticipantId,
        winnerUserUuid: actualWinner === 'east' ? eastPlayerIdentifier : westPlayerIdentifier,
        loserUserUuid: actualWinner === 'east' ? westPlayerIdentifier : eastPlayerIdentifier,
        eastParticipantId,
        westParticipantId,
        gamesHistory: technicalGamesHistory.map(game => ({
          gameIndex: game.gameIndex,
          east: game.east,
          west: game.west,
          winner: game.winner
        }))
      };
      
      const response = await axios.post(
        `${API_URL}/api/tournaments/${tournament.tournamentId}/matches/${tournament.tournamentMatchId}/result`,
        resultPayload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`[GameServer] Tournament match result reported successfully:`, response.data);
    } else {
      // Casual match
      console.log(`[GameServer] Casual match ${match.id} completed, reporting result`);
      
      const resultPayload = {
        team1Players: [eastPlayerIdentifier],
        team2Players: [westPlayerIdentifier],
        team1Score: eastScore,
        team2Score: westScore,
      };
      
      const response = await axios.post(
        `${API_URL}/api/matches`,
        resultPayload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`[GameServer] Casual match result reported successfully:`, response.data);
    }
    
    match.resultSubmitted = true;
    
  } catch (error) {
    console.error(`[GameServer] Failed to report match result:`, error);
    match.resultSubmitting = false;
  }
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
      participantId: expected.participantId,
      alias: expected.alias,
    };
    match.players[seat] = player;
    expected.joined = true;
    reservation.consumedJtis.add(claims.jti);

    console.log(
      `[GameServer] Player joined room=${roomIdentifier} seat=${seat} player=${claims.sub}`,
    );

    // Cancel grace period if player reconnected
    if (match.disconnectGracePeriod?.disconnectedSeat === seat) {
      cancelDisconnectGracePeriod(match);
      
      // Notify all players about reconnection
      const reconnectMsg = JSON.stringify({
        type: 'OPPONENT_RECONNECTED',
      });
      match.players.P1?.socket.send(reconnectMsg);
      match.players.P2?.socket.send(reconnectMsg);
      
      console.log(`[GameServer] Player ${seat} reconnected, grace period cancelled`);
      
      // Resume the match if it was started
      if (match.started && !match.loop) {
        console.log(`[GameServer] Resuming match ${roomIdentifier} after reconnection`);
        startMatch(match);
      }
    }

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
        
        // Check if match has started and is a tournament match
        const isTournamentMatch = Boolean(currentMatch.reservation.tournament);
        const matchHasStarted = currentMatch.started;
        const hasRemainingPlayer = currentMatch.players.P1 || currentMatch.players.P2;

        console.log(`[GameServer] Disconnect details: tournament=${isTournamentMatch}, started=${matchHasStarted}, hasRemaining=${hasRemainingPlayer}`);

        if (!currentMatch.players.P1 || !currentMatch.players.P2) {
          if (currentMatch.startTimeout) {
            clearTimeout(currentMatch.startTimeout);
            currentMatch.startTimeout = undefined;
          }
          
          // If match has started with one player remaining, start grace period
          if (matchHasStarted && hasRemainingPlayer) {
            console.log(`[GameServer] Match in progress, starting grace period for ${seat} (tournament: ${isTournamentMatch})`);
            if (currentMatch.loop) {
              clearInterval(currentMatch.loop);
              currentMatch.loop = undefined;
            }
            handleDisconnectGracePeriod(currentMatch, seat);
          } else {
            // Non-tournament match or match hasn't started yet - clean up normally
            if (currentMatch.loop) {
              clearInterval(currentMatch.loop);
              currentMatch.loop = undefined;
              console.log(`[GameServer] Pausing match ${roomIdentifier} waiting for opponent`);
            }
            currentMatch.startAtEpochMs = undefined;
            currentMatch.started = false;
          }
        } else {
          // Both players still connected, cancel any grace period
          cancelDisconnectGracePeriod(currentMatch);
        }
        
        if (!currentMatch.players.P1 && !currentMatch.players.P2) {
          if (currentMatch.loop) {
            clearInterval(currentMatch.loop);
            console.log(`[GameServer] Match ${roomIdentifier} ended and cleaned up`);
          }
          if (currentMatch.disconnectGracePeriod?.graceTimeout) {
            clearTimeout(currentMatch.disconnectGracePeriod.graceTimeout);
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
