import type { MessageCtx } from './types';
import type { HandoffTimeoutMessage } from '../../net/messageTypes';

export function onHandoffTimeout(
  msg: HandoffTimeoutMessage,
  ctx: MessageCtx,
) {
  const previousMatchId = ctx.pendingMatchGet()?.tournamentMatchId;
  ctx.enqueueSnackbar({ message: msg.message ?? 'Match handoff timed out', variant: 'error' });
  ctx.setMatchPhase('idle');
  ctx.pendingMatchSet(null);
  if (typeof previousMatchId === 'number') ctx.clearCountdown(previousMatchId);
}
