export function notifyMatchesReady(tournamentId: number, matchIds: number[]) {
  if (!matchIds.length) return;
  console.log('[Tournament] Matches ready for scheduling', {
    tournamentId,
    matchIds,
  });
  // TODO: integrate with matchmaking service (publish to Redis / HTTP call)
}
