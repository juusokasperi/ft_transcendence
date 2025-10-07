import React from 'react';
import Button from '../../../components/Button';

export type TournamentPageHeaderProps = {
  isDetailView: boolean;
  displayTournamentId: number | null;
  displayTournamentName: string | null;
  connectionReady: boolean;
  loading: boolean;
  onRefresh(): void;
  onLeaveTournament?(): void;
  onForfeitTournament?(): void;
  canForfeit?: boolean;
};

const TournamentPageHeader: React.FC<TournamentPageHeaderProps> = ({
  isDetailView,
  displayTournamentId,
  displayTournamentName,
  connectionReady,
  loading,
  onRefresh,
  onLeaveTournament,
  onForfeitTournament,
  canForfeit,
}) => {
  // Generate display title for detail view
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
        <h1 className="text-3xl font-semibold">
          {isDetailView ? detailTitle : 'Ping Pong Tournaments'}
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
        {isDetailView && canForfeit && onForfeitTournament && (
          <Button variant="dangerSecondary" size="sm" onClick={onForfeitTournament}>
            Forfeit
          </Button>
        )}
        <span>
          Connection:
          <span className={`ml-2 font-semibold ${connectionReady ? 'text-emerald-400' : 'text-rose-400'}`}>
            {connectionReady ? 'Ready' : 'Connecting…'}
          </span>
        </span>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : isDetailView ? 'Refresh data' : 'Refresh list'}
        </Button>
      </div>
    </header>
  );
};

export default TournamentPageHeader;
