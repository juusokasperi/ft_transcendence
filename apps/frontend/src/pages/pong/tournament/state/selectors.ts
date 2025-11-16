import type { TournamentState } from './tournamentReducer';

export function selectSortedParticipants(state: TournamentState) {
  const statusOrder: Record<string, number> = {
    champion: 1,
    silver: 2,
    third_place: 3,
    eliminated: 4,
    forfeited: 5,
    active: 6,
    pending: 7,
    accepted: 8,
  };
  return [...state.participants].sort((a, b) => {
    const orderA = statusOrder[a.status] ?? 99;
    const orderB = statusOrder[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;
    return a.alias.localeCompare(b.alias);
  });
}

export function selectMatchesByStage(state: TournamentState) {
  return [...state.bracket].sort((a, b) => {
    if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
    return a.roundPosition - b.roundPosition;
  });
}

export function selectCurrentParticipantId(
  state: TournamentState,
  userUuid: string | null,
): number | null {
  if (!userUuid) return null;
  const entry = state.participants.find((p) => p.userUuid === userUuid);
  return entry?.participantId ?? null;
}
