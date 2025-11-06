import type { TournamentMatchState } from '@pong/shared/protocol/net';

type ParticipantPayload = {
  id: number;
  alias: string;
  seed: number | null;
  status: string;
  userUuid: string | null;
};

type MatchPayload = {
  id: number;
  roundNumber: number;
  roundPosition: number;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  matchId: number | null;
};

type MatchPlayer = { participantId: number; teamNumber: number };

/**
 * Inflate tournament matches by joining base match rows with their players and participants.
 * Purely transforms payloads without side effects.
 */
export function inflateMatches(
  matches: MatchPayload[],
  participants: ParticipantPayload[],
  playersByMatchId: Map<number, MatchPlayer[]>,
): TournamentMatchState[] {
  const participantMap = new Map(participants.map((p) => [p.id, p] as const));
  return matches.map((match) => {
    const matchPlayers = playersByMatchId.get(match.id) ?? [];
    const players = matchPlayers.map((player) => {
      const participant = participantMap.get(player.participantId);
      return {
        participantId: player.participantId,
        teamNumber: player.teamNumber,
        alias: participant?.alias ?? 'Unknown',
        status: participant?.status ?? 'pending',
        score: null,
      };
    });

    return {
      tournamentMatchId: match.id,
      roundNumber: match.roundNumber,
      roundPosition: match.roundPosition,
      status: match.status,
      scheduledAt: match.scheduledAt,
      completedAt: match.completedAt,
      matchId: match.matchId,
      players,
    } satisfies TournamentMatchState;
  });
}

