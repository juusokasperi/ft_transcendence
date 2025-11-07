import type { MessageCtx } from './types';
import type { TournamentBracketSnapshotMessage } from '../../net/messageTypes';

export function onBracketSnapshot(msg: TournamentBracketSnapshotMessage, ctx: MessageCtx) {
  ctx.setBracket(msg.matches);
}
