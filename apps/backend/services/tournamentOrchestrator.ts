import db from '../db/client.ts';
import { listTournamentParticipants } from '../db/queries/tournamentParticipants.ts';
import {
  addTournamentMatchPlayer,
  createTournamentMatch,
  listTournamentMatches,
} from '../db/queries/tournamentMatches.ts';
import type {
  TournamentParticipant,
} from '../types/types.ts';

const REQUIRED_PARTICIPANTS = 4;

export type BracketGenerationSummary = {
  tournamentId: number;
  participantCount: number;
  bracketSize: number;
  totalRounds: number;
  createdMatches: number;
  assignedParticipants: number;
  skippedReason?: 'awaitingParticipants' | 'matchesAlreadyExist';
};

function sortParticipantsForBracket(participants: TournamentParticipant[]): TournamentParticipant[] {
  const withMeta = participants.map((participant, index) => ({
    participant,
    joinOrder: index,
    seed: participant.seed,
  }));

  withMeta.sort((a, b) => {
    const aSeed = a.seed;
    const bSeed = b.seed;

    const aHasSeed = aSeed !== null && aSeed !== undefined;
    const bHasSeed = bSeed !== null && bSeed !== undefined;

    if (aHasSeed && bHasSeed) {
      if (aSeed! !== bSeed!) return aSeed! - bSeed!;
      return a.joinOrder - b.joinOrder;
    }
    if (aHasSeed) return -1;
    if (bHasSeed) return 1;
    return a.joinOrder - b.joinOrder;
  });

  return withMeta.map((item) => item.participant);
}

// Call this after registration closes to lock in the bracket.
export function generateSingleEliminationBracket(tournamentId: number): BracketGenerationSummary {
  const participants = sortParticipantsForBracket(listTournamentParticipants(tournamentId));
  const participantCount = participants.length;

  if (participantCount < REQUIRED_PARTICIPANTS) {
    return {
      tournamentId,
      participantCount,
      bracketSize: REQUIRED_PARTICIPANTS,
      totalRounds: 2,
      createdMatches: 0,
      assignedParticipants: 0,
      skippedReason: 'awaitingParticipants',
    };
  }

  const existingMatches = listTournamentMatches(tournamentId);
  if (existingMatches.length > 0) {
    return {
      tournamentId,
      participantCount: REQUIRED_PARTICIPANTS,
      bracketSize: REQUIRED_PARTICIPANTS,
      totalRounds: 2,
      createdMatches: 0,
      assignedParticipants: 0,
      skippedReason: 'matchesAlreadyExist',
    };
  }

  const seeded: Array<TournamentParticipant | undefined> = participants.slice(0, REQUIRED_PARTICIPANTS);
  while (seeded.length < REQUIRED_PARTICIPANTS) seeded.push(undefined);

  const transaction = db.transaction(() => {
    let createdMatches = 0;
    let assignedParticipants = 0;

    const matchDefinitions = [
      { roundNumber: 1, roundPosition: 1, slots: [0, 3] },
      { roundNumber: 1, roundPosition: 2, slots: [1, 2] },
      { roundNumber: 2, roundPosition: 1, slots: null },
      { roundNumber: 2, roundPosition: 2, slots: null },
    ] as const;

    for (const def of matchDefinitions) {
      const match = createTournamentMatch({
        tournamentId,
        roundNumber: def.roundNumber,
        roundPosition: def.roundPosition,
      });
      if (!match) throw new Error('Failed to create tournament match');
      createdMatches += 1;

      if (def.slots) {
        def.slots.forEach((slotIndex, teamIdx) => {
          const participant = seeded[slotIndex];
          if (!participant) return;
          const assignment = addTournamentMatchPlayer(match.id, participant.id, teamIdx + 1);
          if (!assignment) throw new Error('Failed to assign participant to match slot');
          assignedParticipants += 1;
        });
      }
    }

    return {
      tournamentId,
      participantCount: REQUIRED_PARTICIPANTS,
      bracketSize: REQUIRED_PARTICIPANTS,
      totalRounds: 2,
      createdMatches,
      assignedParticipants,
    } satisfies BracketGenerationSummary;
  });

  return transaction();
}
