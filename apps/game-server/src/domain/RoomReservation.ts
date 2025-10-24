import { randomUUID } from 'node:crypto';
import type { RoomState } from '@pong/shared/protocol/net';
import type {
  TournamentReservation,
  ExpectedPlayer,
  RoomReservation,
  Seat,
  TableSide,
} from './MatchTypes.ts';

export type CreateRoomRequest = {
  idempotencyKey: string;
  roomIdentifier: string;
  capacity: number;
  expectedPlayers: Array<{
    playerIdentifier: string;
    side: TableSide;
    alias?: string;
    mmr: number;
  }>;
  randomSeed?: number;
  simulationStartTick?: number;
  joinDeadlineAtEpochMs?: number;
  tournament?: TournamentReservation;
};

export function seatForSide(side: TableSide): Seat {
  return side === 'east' ? 'P1' : 'P2';
}

export function createRoomReservation(payload: CreateRoomRequest): RoomReservation {
  if (!payload.idempotencyKey || !payload.roomIdentifier) {
    throw new Error('Missing idempotencyKey or roomIdentifier');
  }
  if (!Array.isArray(payload.expectedPlayers) || payload.expectedPlayers.length === 0) {
    throw new Error('expectedPlayers must be a non-empty array');
  }
  if (payload.capacity < payload.expectedPlayers.length) {
    throw new Error('capacity must be greater than or equal to expected players');
  }

  const randomSeed =
    typeof payload.randomSeed === 'number'
      ? payload.randomSeed
      : Number.parseInt(randomUUID().slice(0, 8), 16);
  const simulationStartTick =
    typeof payload.simulationStartTick === 'number' ? payload.simulationStartTick : Date.now();
  const joinDeadlineAtEpochMs =
    typeof payload.joinDeadlineAtEpochMs === 'number'
      ? payload.joinDeadlineAtEpochMs
      : Date.now() + 15_000;

  const participantsLookup = new Map(
    payload.tournament?.participants?.map((p) => [p.userUuid, p]) ?? [],
  );
  const expectedMap = new Map<string, ExpectedPlayer>();
  for (const player of payload.expectedPlayers) {
    if (!player.playerIdentifier || (player.side !== 'east' && player.side !== 'west')) {
      throw new Error('Invalid expected player payload');
    }
    const participant = participantsLookup.get(player.playerIdentifier);
    expectedMap.set(player.playerIdentifier, {
      playerIdentifier: player.playerIdentifier,
      side: player.side,
      seat: seatForSide(player.side),
      joined: false,
      participantId: participant?.participantId,
      alias: participant?.alias ?? player.alias,
      mmr: Number.isFinite(player.mmr) ? player.mmr : 1000,
    });
  }

  return {
    roomIdentifier: payload.roomIdentifier,
    idempotencyKey: payload.idempotencyKey,
    capacity: payload.capacity,
    joinDeadlineAtEpochMs,
    randomSeed,
    simulationStartTick,
    expectedPlayers: expectedMap,
    consumedJtis: new Set<string>(),
    tournament: payload.tournament,
  };
}

export function resolveRoomState(started: boolean, playersReady: boolean): RoomState {
  if (started) return 'PLAYING';
  return playersReady ? 'READY' : 'WAITING_FOR_OPPONENT';
}
