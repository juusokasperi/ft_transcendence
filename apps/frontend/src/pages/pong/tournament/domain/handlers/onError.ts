import type { MessageCtx } from './types';

export function onError(
  msg: { type: 'ERROR'; code?: string; message?: string },
  ctx: MessageCtx,
) {
  ctx.enqueueSnackbar({ message: msg.message ?? 'Tournament error', variant: 'error' });
  if (msg.code === 'AUTH') ctx.navigate('/login');
  // Do not auto-refresh tournament list; refresh is user-driven or on first load
}
