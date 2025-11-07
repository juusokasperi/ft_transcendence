import type { MessageCtx } from './types';
import type { TournamentMatchCountdownMessage } from '../../net/messageTypes';
import { createCountdownSnapshot, nextMatchPhaseForCountdown } from '../countdown';

export function onCountdown(
  payload: TournamentMatchCountdownMessage,
  ctx: MessageCtx,
) {
  if (ctx.getActiveTournamentId() !== payload.tournamentId) return;

  ctx.setMatchCountdowns((prev) => {
    const next = new Map(prev);
    next.set(payload.tournamentMatchId, createCountdownSnapshot(payload));
    return next;
  });

  const personal = ctx.pendingMatchGet()?.tournamentMatchId === payload.tournamentMatchId;
  if (personal) {
    const next = nextMatchPhaseForCountdown(ctx.getMatchPhase(), payload, true);
    ctx.setMatchPhase(next);
  }
}
