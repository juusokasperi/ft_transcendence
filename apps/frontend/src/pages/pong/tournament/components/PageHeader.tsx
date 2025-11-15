import React from 'react';
import Button from '../../../../components/Button';
import { InlineSpinner } from '@ft/spinner';
// Reuse the matchmaking status badge chip for a consistent look
import StatusBadge from '../../online/components/StatusBadge';

export type TournamentPageHeaderProps = {
  isDetailView: boolean;
  displayTournamentId: number | null;
  displayTournamentName: string | null;
  connectionReady: boolean;
  loading: boolean;
  onRefresh(): void;
  onLeaveTournament?(): void;
};

const TournamentPageHeader: React.FC<TournamentPageHeaderProps> = ({
  isDetailView,
  displayTournamentId,
  displayTournamentName,
  connectionReady,
  loading,
  onRefresh,
  onLeaveTournament,
}) => {
  const detailTitle = (() => {
    if (!isDetailView) return '';
    if (displayTournamentName) {
      return displayTournamentName;
    }
    if (displayTournamentId !== null) {
      return `Tournament #${displayTournamentId}`;
    }
    return 'Tournament lobby';
  })();

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 id="page-title" className="text-3xl font-semibold">
          {isDetailView ? detailTitle : 'Pong Tournaments'}
        </h1>
        <p className="text-white/60">
          {isDetailView
            ? 'Stay in sync with participants, bracket updates, and match countdowns for this tournament.'
            : 'Create or join four-slot tournaments.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
        {isDetailView && onLeaveTournament && (
          <Button variant="danger" size="sm" onClick={onLeaveTournament}>
            Leave tournament
          </Button>
        )}
        {connectionReady ? (
          // Use the same green "Ready" chip style from the online page
          <StatusBadge status="connected" />
        ) : (
          // Yellow connecting chip for consistency with online matchmaking
          <StatusBadge status="connecting" />
        )}
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
    </header>
  );
};

export default TournamentPageHeader;
