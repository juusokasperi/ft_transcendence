import type { MessageCtx } from './types';

export function onConnected(_msg: { type: 'CONNECTED' }, ctx: MessageCtx) {
  ctx.setConnectionReady(true);
}
