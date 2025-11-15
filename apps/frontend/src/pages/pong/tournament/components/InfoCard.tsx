import React, { useState } from 'react';
import Button from '../../../../components/Button';
import SurfaceCard from '../../shared/components/SurfaceCard';
import { ALIAS_MAX_LENGTH, aliasInputAllowedRegex } from '../../../../utils/alias';
import ConfirmDialog from '../../../../components/ConfirmDialog';

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <SurfaceCard className="p-6 shadow-2xl">
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
          maxLength={ALIAS_MAX_LENGTH}
          onBeforeInput={(event) => {
            const nativeEvent = event.nativeEvent as InputEvent;
            if (
              nativeEvent.inputType === 'insertText' &&
              nativeEvent.data &&
              !aliasInputAllowedRegex.test(nativeEvent.data)
            ) {
              event.preventDefault();
            }
          }}
        />
        {currentParticipantId !== null ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if ((tournamentStatus ?? '').toLowerCase() === 'completed') {
                onLeave();
              } else {
                setConfirmOpen(true);
              }
            }}
          >
            Leave tournament
          </Button>
        ) : (
          <Button
            variant="success"
            size="sm"
            onClick={onJoin}
            disabled={!connectionReady || tournamentId === null}
          >
            Join tournament
          </Button>
        )}
      </div>
      {(tournamentStatus ?? '').toLowerCase() !== 'completed' && (
        <ConfirmDialog
          open={confirmOpen}
          title="Leave tournament?"
          description="You will not be able to come back to this tournament and be declared forfeit."
          confirmLabel="Leave"
          cancelLabel="Stay"
          tone="danger"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onLeave();
          }}
        />
      )}
      {currentParticipantId === null && (
        <p className="mt-2 text-xs text-white/60">
          Choose a nickname for the bracket before joining. You can update it until the matches
          start.
        </p>
      )}
    </SurfaceCard>
  );
};

export default TournamentInfoCard;
