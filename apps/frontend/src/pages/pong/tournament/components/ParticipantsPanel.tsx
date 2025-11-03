import React from 'react';
import type { TournamentParticipantState } from '@pong/shared/protocol/net';
import SurfaceCard from '../../shared/components/SurfaceCard';
import { participantStatusLabel } from '../utils/utils';

export type TournamentParticipantsPanelProps = {
  participants: TournamentParticipantState[];
  hasActiveTournament: boolean;
  currentUserUuid: string | null;
};

const TournamentParticipantsPanel: React.FC<TournamentParticipantsPanelProps> = ({
  participants,
  hasActiveTournament,
  currentUserUuid,
}) => {
  return (
    <SurfaceCard as="aside" className="shadow-2xl p-6">
      <h2 className="mb-3 text-lg font-semibold">Participants</h2>
      {!hasActiveTournament ? (
        <p className="text-sm text-white/60">Join a tournament to see participants.</p>
      ) : participants.length === 0 ? (
        <p className="text-sm text-white/60">Waiting for players…</p>
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
              <span>{participant.alias}</span>
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">
                {participantStatusLabel(participant.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
};

export default TournamentParticipantsPanel;
