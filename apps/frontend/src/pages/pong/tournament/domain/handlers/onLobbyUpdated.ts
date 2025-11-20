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
  // Persistently mark any participants who are now forfeited
  try {
    const forfeited = msg.participants
      .filter((p) => String(p.status).toLowerCase() === 'forfeited')
      .map((p) => p.participantId);
    if (forfeited.length) ctx.markForfeited?.(forfeited);
  } catch {}

  // Membership + routing
  const member = isMember(ctx.userUuid, msg.participants);
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
    ctx.getPathname(),
  );
  if (route) ctx.navigate(route);

  // Update in-memory tournaments list from socket without extra network
  const list = ctx.getAvailableTournaments().slice();
  const index = list.findIndex((i) => i.id === msg.tournamentId);

  if (index === -1) {
    // New to this client: add minimal row WITHOUT fabricating timestamps
    list.push({
      id: msg.tournamentId,
      status: msg.status,
      maxParticipants: msg.maxParticipants ?? TOURNAMENT_SIZE,
      // leave startAt/createdAt/updatedAt/completedAt, and name as undefined
    });
  } else {
    const existing = list[index]!;
    // Update **only** fields we actually know changed; preserve server timestamps
    list[index] = {
      ...existing,
      status: msg.status,
      maxParticipants: msg.maxParticipants ?? existing.maxParticipants ?? TOURNAMENT_SIZE,
      // do not write updatedAt/createdAt/startAt/completedAt here
    };
  }

  ctx.setAvailableTournaments(ctx.filterTournamentsForDisplay(list));
}
