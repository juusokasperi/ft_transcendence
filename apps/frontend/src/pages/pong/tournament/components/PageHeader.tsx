import React, { useState } from 'react';
import Button from '../../../../components/Button';
import { InlineSpinner } from '@ft/spinner';
// Reuse the matchmaking status badge chip for a consistent look
import StatusBadge from '../../online/components/StatusBadge';
import ConfirmDialog from '../../../../components/ConfirmDialog';

export type TournamentPageHeaderProps = {
  isDetailView: boolean;
  displayTournamentName: string | null;
  tournamentStatus?: string | null;
  connectionReady: boolean;
  loading: boolean;
  onRefresh(): void;
  onLeaveTournament?(): void;
};

const TournamentPageHeader: React.FC<TournamentPageHeaderProps> = ({
  isDetailView,
  displayTournamentName,
  tournamentStatus,
  connectionReady,
  loading,
  onRefresh,
  onLeaveTournament,
}) => {
  const detailTitle = (() => {
    if (!isDetailView) return '';
    if (displayTournamentName) return displayTournamentName;
    return 'Pong Tournament';
  })();

  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 id="page-title" className="text-3xl font-semibold">
          {isDetailView ? detailTitle : 'Pong Tournaments'}
        </h1>
        <p className="text-white/60">
          {isDetailView
            ? 'May the best pong player win.'
            : 'Create and join four-slot tournaments.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
        {isDetailView && onLeaveTournament && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              const status = (tournamentStatus ?? '').toLowerCase();
              if (status === 'completed' || status === 'draft') {
                onLeaveTournament();
                return;
              }
              setConfirmOpen(true);
            }}
          >
            Leave tournament
          </Button>
        )}
        {connectionReady ? <StatusBadge status="connected" /> : <StatusBadge status="connecting" />}
        <Button variant="primary" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? (
            <InlineSpinner
              size={16}
              color="#FFFFFF"
              label="Refreshing"
              ariaLabel="Refreshing tournament data"
              className="text-current"
              labelClassName="text-current"
            />
          ) : isDetailView ? (
            'Refresh details'
          ) : (
            'Refresh list'
          )}
        </Button>
      </div>
      {onLeaveTournament &&
        !['completed', 'draft'].includes((tournamentStatus ?? '').toLowerCase()) && (
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
              try {
                onLeaveTournament();
              } catch {}
            }}
          />
        )}
    </header>
  );
};

export default TournamentPageHeader;
