import type { MatchMode, ClientInfo } from '../types/types';
import { handleJoinQueue } from './queue';
import { log } from '@utils/logger';

interface PendingHandoff {
  timers: Record<string, NodeJS.Timeout>;
  players: Record<string, ClientInfo>;
  roomIdentifier: string;
  mode?: MatchMode;
}

const pendingHandoffs = new Map<string, PendingHandoff>();

export function handleHandoff(player: ClientInfo, roomIdentifier: string, mode?: MatchMode) {
  let handoff = pendingHandoffs.get(roomIdentifier);
  if (!handoff) {
    handoff = { timers: {}, players: {}, roomIdentifier, mode } as PendingHandoff;
    pendingHandoffs.set(roomIdentifier, handoff);
  }
  handoff.players[player.uuid] = player;

  const timer = setTimeout(() => {
    if (!player || !player.socket) {
      log(
        'Player socket missing on handoff timeout',
        {
          uuid: player?.uuid ?? 'Unknown',
          roomIdentifier,
        },
        'error',
      );
      return;
    }
    if (mode === 'tournament' || mode === 'invite') {
      player.socket.send(
        JSON.stringify({
          type: 'HANDOFF_TIMEOUT',
          roomIdentifier,
          message: 'Failed to join scheduled match in time.',
        }),
      );
    } else {
      player.socket.send(
        JSON.stringify({
          type: 'HANDOFF_TIMEOUT',
          roomIdentifier,
          message: 'Failed to join game server in time. Rejoining queue.',
        }),
      );
      handleJoinQueue(player);
    }
    clearTimeout(handoff.timers[player.uuid]);
    delete handoff.timers[player.uuid];
    delete handoff.players[player.uuid];
    if (Object.keys(handoff.players).length === 0) pendingHandoffs.delete(roomIdentifier);
  }, 15000);

  handoff.timers[player.uuid] = timer;
  log('Added player to pending handoffs map', { uuid: player.uuid, roomIdentifier, mode });
}

export function handleAdmitConfirmed(roomIdentifier: string) {
  const handoff = pendingHandoffs.get(roomIdentifier);
  if (handoff) {
    Object.values(handoff.timers).forEach(clearTimeout);
    Object.values(handoff.players).forEach((player) => {
      player.socket.close();
    });
    log('Match started, closing connections', {
      roomIdentifier,
      playerUuids: Object.keys(handoff.players),
    });
    pendingHandoffs.delete(roomIdentifier);
  }
}
