import type { MessageCtx } from './types';
import type { TournamentMatchesReadyMessage } from '../../net/messageTypes';

export function onMatchesReady(
  msg: TournamentMatchesReadyMessage,
  ctx: MessageCtx,
) {
  ctx.setLatestReadyMatches(msg.matches);
  // Refresh tournament snapshot to include updated bracket/participants
  void ctx.refreshTournamentState();

  // Prune countdowns to only active matches
  const activeIds = new Set(msg.matches.map((m) => m.tournamentMatchId));
  ctx.setMatchCountdowns((prev) => {
    const next = new Map<number, any>();
    let changed = false;
    for (const [key, value] of prev.entries()) {
      if (activeIds.has(key)) next.set(key, value);
      else changed = true;
    }
    return changed ? next : prev;
  });

  // Assign pending match for the current user
  const userUuid = ctx.userUuid;
  if (userUuid) {
    const personal = msg.matches.find((match) =>
      match.participants.some((p) => p.userUuid === userUuid),
    );
    if (personal) {
      ctx.pendingMatchSet(personal);
      const phase = ctx.getMatchPhase();
      ctx.setMatchPhase(phase === 'starting' || phase === 'playing' ? phase : 'awaiting_start');
    } else {
      ctx.pendingMatchSet(null);
    }
  } else {
    ctx.pendingMatchSet(null);
  }
}
