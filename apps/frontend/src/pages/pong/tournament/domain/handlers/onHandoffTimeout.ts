import type { MessageCtx } from './types';

export function onHandoffTimeout(
  msg: import('@pong/shared/protocol/net').HandoffTimeoutMessage,
  ctx: MessageCtx,
) {
  const previousMatchId = ctx.pendingMatchGet()?.tournamentMatchId;
  ctx.enqueueSnackbar({ message: msg.message ?? 'Match handoff timed out', variant: 'error' });
  ctx.setMatchPhase('idle');
  ctx.pendingMatchSet(null);
  if (typeof previousMatchId === 'number') ctx.clearCountdown(previousMatchId);
}

