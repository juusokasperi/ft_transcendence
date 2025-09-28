import type { MatchMode, ClientInfo } from '../types/types';
import { handleJoinQueue } from './queue';
import { log } from './log';

interface PendingHandoff {
  timer: NodeJS.Timeout;
  player: ClientInfo;
  matchId: string;
  mode?: MatchMode;
}

const pendingHandoffs = new Map<string, PendingHandoff>();

export function handleHandoff(player: ClientInfo, matchId: string, mode?: MatchMode) {
  const timer = setTimeout(() => {
    if (mode === 'tournament' || mode === 'invite') {
      player.socket.send(
        JSON.stringify({
          type: 'MATCH_FORFEIT',
          matchId,
          message: 'Opponent did not join in time. Match forfeited.',
        }),
      );
    } else {
      player.socket.send(
        JSON.stringify({
          type: 'HANDOFF_TIMEOUT',
          matchId,
          message: 'Failed to join game server in time. Rejoining queue.',
        }),
      );
      handleJoinQueue(player);
    }
    pendingHandoffs.delete(player.id);
  }, 15000);

  log('Adding to pending handoffs map', { clientId: player.id, matchId, mode });
  pendingHandoffs.set(player.id, { timer, player, matchId, mode });
}

export function handleAdmitConfirmed(playerId: string) {
  const handoff = pendingHandoffs.get(playerId);
  if (handoff) {
    clearTimeout(handoff.timer);
    pendingHandoffs.delete(playerId);
  }
}
