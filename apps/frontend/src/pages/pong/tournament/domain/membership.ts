import type { TournamentParticipantState } from '../net/messageTypes';

export type MembershipInfo = {
  member: boolean;
  tournamentId: number | null;
};

export function isMember(
  userUuid: string | null | undefined,
  participants: TournamentParticipantState[],
  tournamentStatus: string,
): boolean {
  if (!userUuid) return false;
  // Keep membership even after completion so users can view final results
  // and decide when to leave the tournament. However, treat explicit
  // forfeits as leaving the tournament.
  return participants.some((p) => p.userUuid === userUuid && p.status !== 'forfeited');
}

/**
 * Decide the navigation path based on membership transition and current location.
 * Returns a path to navigate to or null when no navigation is needed.
 */
export function computeNextRoute(
  prev: MembershipInfo,
  next: MembershipInfo,
  currentPath: string,
): string | null {
  if (next.member) {
    const detailPath = `/pong/tournaments/${next.tournamentId}`;
    const joinedDifferentTournament = !prev.member || prev.tournamentId !== next.tournamentId;
    if (joinedDifferentTournament && currentPath !== detailPath) return detailPath;
    return null;
  }

  // Leaving: if we were on the detail page, go back to the list
  if (prev.member && prev.tournamentId !== null) {
    const detailPath = `/pong/tournaments/${prev.tournamentId}`;
    if (currentPath === detailPath) return '/pong/tournaments';
  }
  return null;
}
