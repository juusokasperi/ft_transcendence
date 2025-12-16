/**
 * In-memory tournament membership registry.
 *
 * Purpose:
 *   - Track which user UUIDs are currently in an *active* tournament.
 *   - Used by matchmaking to block other flows (notably invite matches) that
 *     are incompatible with tournaments.
 *
 * Where it is used:
 *   - `scheduledMatches.ts` updates this registry on join/leave/restore and
 *     calls `syncTournamentMembershipSnapshot` after backend syncs.
 *   - `invites.ts` calls `isUserInTournament` to reject/tear down invite lobbies
 *     when a player is already reserved for a tournament.
 *
 * This registry is best-effort and process-local. Backend remains the source of
 * truth; a restart will repopulate state via `restoreTournamentMembership` and
 * subsequent snapshot syncs.
 */

type MembershipInfo = {
  /** Tournament identifier this user is participating in. */
  tournamentId: number;
  /** Participant id from backend (present for authenticated users). */
  participantId?: number;
  /** Backend participant status snapshot (used for pruning). */
  status?: string | null;
};

// In-memory registry tracking which users are currently in an active tournament.
// Keyed by stable user UUID so we can reason across reconnects/tabs.
const activeTournamentMembers = new Map<string, MembershipInfo>();

// Terminal statuses in the tournament lifecycle; participants with these statuses
// are no longer considered "active" tournament members.
const TERMINAL_STATUSES = new Set(['eliminated', 'forfeited', 'champion', 'silver', 'third_place']);

/** Helper: true when a participant status means they are still actively playing. */
function isActiveStatus(status: string | null | undefined) {
  if (!status) return false;
  return !TERMINAL_STATUSES.has(status);
}

/**
 * Register/update a user's tournament membership.
 *
 * Called from `scheduledMatches.ts` after backend create/join/restore.
 */
export function setTournamentMembership(
  userUuid: string,
  membership: MembershipInfo,
): MembershipInfo {
  activeTournamentMembers.set(userUuid, membership);
  return membership;
}

/**
 * Remove a user's tournament membership.
 *
 * Called when a user leaves/forfeits or when snapshot sync detects a terminal status.
 */
export function clearTournamentMembership(userUuid: string) {
  activeTournamentMembers.delete(userUuid);
}

/**
 * Check if a user is currently tracked as belonging to an active tournament.
 *
 * By convention, this map only stores active participants (terminal ones are pruned),
 * so callers can treat a defined return value as "in tournament".
 */
export function isUserInTournament(userUuid: string): MembershipInfo | undefined {
  return activeTournamentMembers.get(userUuid);
}

/**
 * Synchronize the in-memory tournament membership registry with a fresh snapshot
 * of participants from the backend API.
 *
 * - Adds/updates entries for participants with active statuses.
 * - Removes entries for participants whose status is terminal.
 * - Prunes members for this tournament that are no longer present in the snapshot.
 */
export function syncTournamentMembershipSnapshot(
  tournamentId: number,
  participants: Array<{ userUuid?: string | null; participantId?: number; status?: string | null }>,
) {
  // Track the UUIDs that remain active in this snapshot.
  const activeUuids = new Set<string>();
  for (const participant of participants) {
    const uuid = participant.userUuid;
    if (!uuid) continue;
    // Active status → keep/update membership.
    if (isActiveStatus(participant.status ?? null)) {
      activeUuids.add(uuid);
      setTournamentMembership(uuid, {
        tournamentId,
        participantId: participant.participantId,
        status: participant.status ?? null,
      });
    } else {
      // Terminal status → remove membership for this tournament.
      const membership = activeTournamentMembers.get(uuid);
      if (membership && membership.tournamentId === tournamentId) {
        activeTournamentMembers.delete(uuid);
      }
    }
  }

  // Remove any tracked members for this tournament that are no longer in the snapshot.
  for (const [uuid, membership] of activeTournamentMembers) {
    // Snapshot did not include this UUID → treat as inactive and prune.
    if (membership.tournamentId === tournamentId && !activeUuids.has(uuid)) {
      activeTournamentMembers.delete(uuid);
    }
  }
}
