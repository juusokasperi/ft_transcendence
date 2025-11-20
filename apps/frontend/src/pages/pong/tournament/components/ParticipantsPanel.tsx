import React from 'react';
import type { TournamentParticipantState } from '../net/messageTypes';
import SurfaceCard from '../../shared/components/SurfaceCard';
import { participantStatusLabel } from '../utils/utils';
import { InlineSpinner } from '@ft/spinner';

export type TournamentParticipantsPanelProps = {
  participants: TournamentParticipantState[];
  hasActiveTournament: boolean;
  currentUserUuid: string | null;
  tournamentStatus?: string | null;
  forfeitedParticipantIds?: Set<number>;
};

const TournamentParticipantsPanel: React.FC<TournamentParticipantsPanelProps> = ({
  participants,
  hasActiveTournament,
  currentUserUuid,
  tournamentStatus,
  forfeitedParticipantIds,
}) => {
  return (
    <SurfaceCard as="aside" className="p-6 shadow-2xl">
      <h2 className="mb-3 text-lg font-semibold">Participants</h2>
      {!hasActiveTournament ? (
        <p className="text-sm text-white/60">Join a tournament to see participants.</p>
      ) : participants.length === 0 ? (
        <p className="text-sm text-white/60">
          <InlineSpinner
            size={16}
            color="#FFFFFF"
            label="Waiting for players"
            ariaLabel="Waiting for players to join"
            className="text-white/60"
            labelClassName="text-white/60"
          />
        </p>
      ) : (
        <ul className="space-y-2">
          {participants.map((participant) => (
            <li
              key={participant.participantId}
              className={`flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm ${
                participant.userUuid === currentUserUuid
                  ? 'border-indigo-400/40 bg-indigo-500/10'
                  : ''
              }`}
            >
              <span>
                {participant.alias}
                {(String(participant.status).toLowerCase() === 'forfeited' ||
                  forfeitedParticipantIds?.has(participant.participantId)) && (
                  <span className="ml-1 text-rose-300/80"> FORFEITED</span>
                )}
              </span>
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">
                {(() => {
                  const tStat = (tournamentStatus ?? '').toLowerCase();
                  const pStat = (participant.status ?? '').toLowerCase();
                  if (tStat && tStat !== 'draft' && (pStat === 'pending' || pStat === 'accepted')) {
                    return 'Active';
                  }
                  return participantStatusLabel(participant.status);
                })()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
};

export default TournamentParticipantsPanel;
