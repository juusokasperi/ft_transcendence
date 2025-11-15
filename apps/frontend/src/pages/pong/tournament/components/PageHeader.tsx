import React from 'react';
import Button from '../../../../components/Button';
import { InlineSpinner } from '@ft/spinner';

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
    <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 id="page-title" className="text-3xl font-semibold">
          {isDetailView ? detailTitle : 'Pong Tournaments'}
        </h1>
        <p className="text-white/60">
          {isDetailView
            ? 'Stay in sync with participants, bracket updates, and match countdowns for this tournament.'
            : 'Create a lobby, invite players, and advance through the fixed four-slot bracket.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
        {isDetailView && onLeaveTournament && (
          <Button variant="outline" size="sm" onClick={onLeaveTournament}>
            Leave tournament
          </Button>
        )}
        <span>
          Connection:
          {connectionReady ? (
            <span className="ml-2 font-semibold text-emerald-400">Ready</span>
          ) : (
            <InlineSpinner
              size={14}
              color="#F87171"
              label="Connecting"
              ariaLabel="Connecting to tournament service"
              className="ml-2 font-semibold text-rose-300"
              labelClassName="font-semibold text-rose-300"
            />
          )}
        </span>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
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
            'Refresh data'
          ) : (
            'Refresh list'
          )}
        </Button>
      </div>
    </header>
  );
};

export default TournamentPageHeader;
