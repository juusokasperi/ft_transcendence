type MembershipInfo = {
  tournamentId: number;
  participantId?: number;
  status?: string | null;
};

const activeTournamentMembers = new Map<string, MembershipInfo>();

const TERMINAL_STATUSES = new Set(['eliminated', 'forfeited', 'champion', 'silver', 'third_place']);

function isActiveStatus(status: string | null | undefined) {
  if (!status) return false;
  return !TERMINAL_STATUSES.has(status);
}

export function setTournamentMembership(
  userUuid: string,
  membership: MembershipInfo,
): MembershipInfo {
  activeTournamentMembers.set(userUuid, membership);
  return membership;
}

export function clearTournamentMembership(userUuid: string) {
  activeTournamentMembers.delete(userUuid);
}

export function isUserInTournament(userUuid: string): MembershipInfo | undefined {
  return activeTournamentMembers.get(userUuid);
}

export function syncTournamentMembershipSnapshot(
  tournamentId: number,
  participants: Array<{ userUuid?: string | null; participantId?: number; status?: string | null }>,
) {
  const activeUuids = new Set<string>();
  for (const participant of participants) {
    const uuid = participant.userUuid;
    if (!uuid) continue;
    if (isActiveStatus(participant.status ?? null)) {
      activeUuids.add(uuid);
      setTournamentMembership(uuid, {
        tournamentId,
        participantId: participant.participantId,
        status: participant.status ?? null,
      });
    } else {
      const membership = activeTournamentMembers.get(uuid);
      if (membership && membership.tournamentId === tournamentId) {
        activeTournamentMembers.delete(uuid);
      }
    }
  }

  // Remove any tracked members for this tournament that are no longer in the snapshot.
  for (const [uuid, membership] of activeTournamentMembers) {
    if (membership.tournamentId === tournamentId && !activeUuids.has(uuid)) {
      activeTournamentMembers.delete(uuid);
    }
  }
}
