import { Redis } from 'ioredis';
import { REDIS_URL } from '../utils/config.ts';
import {
  getTournamentMatchById,
  getTournamentMatchRoster,
} from '../db/queries/tournamentMatches.ts';
import { logger } from '@utils/logger';

const redis = new Redis(REDIS_URL);

type ReadyMatchPayload = {
  tournamentMatchId: number;
  stage: 'semifinal' | 'final' | 'bronze';
  participants: Array<{
    participantId: number;
    alias: string;
    userUuid: string;
    teamNumber: number;
  }>;
};

type MatchesReadyMessage = {
  tournamentId: number;
  matches: ReadyMatchPayload[];
};

function computeStage(round: number, position: number): 'semifinal' | 'final' | 'bronze' {
  if (round === 1) return 'semifinal';
  return position === 1 ? 'final' : 'bronze';
}

export async function notifyMatchesReady(tournamentId: number, matchIds: number[]) {
  if (!matchIds.length) return;

  const payload: MatchesReadyMessage = { tournamentId, matches: [] };

  for (const tournamentMatchId of matchIds) {
    const match = getTournamentMatchById(tournamentMatchId);
    if (!match) continue;

    const roster = getTournamentMatchRoster(tournamentMatchId);
    if (roster.length !== 2) continue;

    // Exclude forfeited participants from ready consideration; do not schedule countdowns
    const readyParticipants = roster.filter((p) => p.userUuid && p.status !== 'forfeited');
    if (readyParticipants.length !== 2) continue;

    payload.matches.push({
      tournamentMatchId,
      stage: computeStage(match.roundNumber, match.roundPosition),
      participants: readyParticipants.map((p) => ({
        participantId: p.participantId,
        alias: p.alias,
        userUuid: p.userUuid!,
        teamNumber: p.teamNumber,
      })),
    });
  }

  if (!payload.matches.length) return;

  try {
    await redis.publish('tournament:matches_ready', JSON.stringify(payload));
  } catch (error) {
    logger.error({ error }, '[Tournament] Failed to publish matches ready');
  }
}

type TournamentStateUpdatedMessage = {
  tournamentId: number;
};

export async function notifyTournamentStateUpdated(tournamentId: number) {
  const payload: TournamentStateUpdatedMessage = { tournamentId };
  try {
    await redis.publish('tournament:state_updated', JSON.stringify(payload));
  } catch (error) {
    logger.error({ error }, '[Tournament] Failed to publish state update');
  }
}
