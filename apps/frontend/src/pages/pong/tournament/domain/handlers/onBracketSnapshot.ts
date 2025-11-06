import type { MessageCtx } from './types';

export function onBracketSnapshot(
  msg: { type: 'TOURNAMENT_BRACKET_SNAPSHOT'; matches: any[] },
  ctx: MessageCtx,
) {
  ctx.setBracket(msg.matches as any);
}

