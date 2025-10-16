import React from 'react';
import Button from '../../../../components/Button';

export type TournamentInfoCardProps = {
  tournamentId: number | null;
  tournamentStatus: string;
  participantsCount: number;
  maxParticipants: number | null;
  aliasInput: string;
  onAliasInputChange(value: string): void;
  currentParticipantId: number | null;
  connectionReady: boolean;
  onJoin(): void;
  onLeave(): void;
};

const TournamentInfoCard: React.FC<TournamentInfoCardProps> = ({
  tournamentId,
  tournamentStatus,
  participantsCount,
  maxParticipants,
  aliasInput,
  onAliasInputChange,
  currentParticipantId,
  connectionReady,
  onJoin,
  onLeave,
}) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
      <h2 className="mb-2 text-lg font-semibold">
        {tournamentId !== null ? `Tournament #${tournamentId}` : 'Tournament lobby'}
      </h2>
      <p className="text-sm text-white/70">
        Status: {tournamentStatus ?? 'unknown'} · Slots: {participantsCount}/
        {maxParticipants ?? '∞'}
      </p>
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          value={aliasInput}
          onChange={(event) => onAliasInputChange(event.target.value)}
          placeholder="Preferred alias"
          className="w-full rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none md:max-w-xs"
        />
        {currentParticipantId !== null ? (
          <Button variant="outline" size="sm" onClick={onLeave}>
            Leave tournament
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onJoin}
            disabled={!connectionReady || tournamentId === null}
          >
            Join tournament
          </Button>
        )}
      </div>
      {currentParticipantId === null && (
        <p className="mt-2 text-xs text-white/60">
          Choose a nickname for the bracket before joining. You can update it until the matches
          start.
        </p>
      )}
    </div>
  );
};

export default TournamentInfoCard;
