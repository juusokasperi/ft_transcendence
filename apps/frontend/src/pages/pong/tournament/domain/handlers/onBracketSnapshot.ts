import type { MessageCtx } from './types';
import type { TournamentBracketSnapshotMessage } from '../../net/messageTypes';

export function onBracketSnapshot(msg: TournamentBracketSnapshotMessage, ctx: MessageCtx) {
  ctx.setBracket(msg.matches);
  // Persist forfeits observed in match snapshots
  try {
    const forfeited: number[] = [];
    for (const m of msg.matches) {
      for (const p of m.players) {
        if (String(p.status).toLowerCase() === 'forfeited') forfeited.push(p.participantId);
      }
    }
    if (forfeited.length) ctx.markForfeited(forfeited);
  } catch {}
}
