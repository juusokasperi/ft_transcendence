import type { MessageCtx } from './types';
import { isMember, computeNextRoute } from '../membership';
import { TOURNAMENT_SIZE } from '../../config';

export function onLobbyUpdated(
  msg: {
    type: 'TOURNAMENT_LOBBY_UPDATED';
    tournamentId: number;
    status: string;
    maxParticipants?: number | null;
    participants: Array<{
      participantId: number;
      alias: string;
      seed: number | null;
      status: string;
      userUuid: string | null;
    }>;
  },
  ctx: MessageCtx,
) {
  // Update meta + participants
  ctx.setTournamentStatus(msg.status);
  ctx.setMaxParticipants(msg.maxParticipants ?? TOURNAMENT_SIZE);
  ctx.setParticipants(msg.participants);

  // Membership + routing
  const member = isMember(ctx.userUuid, msg.participants, msg.status);
  const previousActiveId = ctx.getActiveTournamentId();
  if (member) {
    const changedToThisTournament = previousActiveId !== msg.tournamentId;
    ctx.setActiveTournamentId(msg.tournamentId);
    // Ensure we fetch full snapshot (including proper name) when joining
    if (changedToThisTournament) void ctx.refreshTournamentState(msg.tournamentId);
  } else if (previousActiveId === msg.tournamentId) {
    ctx.setActiveTournamentId(null);
    ctx.resetActiveTournamentState();
  }

  const route = computeNextRoute(
    {
      member: previousActiveId !== null,
      tournamentId: previousActiveId,
    },
    { member, tournamentId: member ? msg.tournamentId : null },
    window.location.pathname,
  );
  if (route) ctx.navigate(route);

  // Update in-memory tournaments list from socket without extra network
  const list = ctx.getAvailableTournaments().slice();
  const index = list.findIndex((i) => i.id === msg.tournamentId);
  const timestamp = new Date().toISOString();
  if (index === -1) {
    list.push({
      id: msg.tournamentId,
      name: `Tournament #${msg.tournamentId}`,
      status: msg.status,
      maxParticipants: msg.maxParticipants ?? TOURNAMENT_SIZE,
      updatedAt: timestamp,
    });
  } else {
    const existing = list[index]!;
    list[index] = {
      ...existing,
      status: msg.status,
      maxParticipants: msg.maxParticipants ?? existing.maxParticipants ?? TOURNAMENT_SIZE,
      updatedAt: timestamp,
    };
  }
  ctx.setAvailableTournaments(ctx.filterTournamentsForDisplay(list));
}
