import type { MessageCtx } from './types';

export function onHandoff(
  msg: import('@pong/shared/protocol/net').HandoffMessage,
  ctx: MessageCtx,
) {
  const currentTournamentId = ctx.getActiveTournamentId();
  if (!msg.tournament || msg.tournament.tournamentId !== currentTournamentId) return;

  const previousMatchId = ctx.pendingMatchGet()?.tournamentMatchId;
  ctx.pendingMatchSet(null);
  if (typeof previousMatchId === 'number') {
    ctx.clearCountdown(previousMatchId);
  }
  ctx.setMatchPhase('starting');
  ctx.setHandoff({
    matchId: msg.matchId,
    roomIdentifier: msg.roomIdentifier,
    gameServerWSUrl: msg.gameServerWSUrl,
    joinToken: msg.joinToken,
    randomSeed: msg.randomSeed,
    side: msg.side,
  });
}

