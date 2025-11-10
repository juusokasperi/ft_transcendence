import React from 'react';
import Button from '../../../components/Button';
import TournamentParticipantsPanel from './components/ParticipantsPanel';
import TournamentBracketPanel from './components/BracketPanel';
import TournamentDirectedMatchesPanel from './components/DirectedMatchesPanel';
import TournamentLobbyPanel from './components/LobbyPanel';
import TournamentPageHeader from './components/PageHeader';
import SurfaceCard from '../shared/components/SurfaceCard';
import PlayingView from '../shared/components/PlayingView';
import { useTournamentPageController } from './hooks/useTournamentPageController';
import PageContainer from '../shared/components/PageContainer';
import PageSection from '../shared/components/PageSection';
type TournamentPageProps = {
  onBack?: () => void;
  focusTournamentId?: number | null;
};

// Moved ChatToggleButton to a shared component for reuse

const TournamentPage: React.FC<TournamentPageProps> = ({ onBack, focusTournamentId = null }) => {
  const {
    user,
    userReady,
    navigate,
    connectionReady,
    loadingTournaments,
    availableTournaments,
    activeTournamentId,
    activeTournamentName,
    tournamentStatus,
    aliasInput,
    setAliasInput,
    tournamentName,
    setTournamentName,
    handleCreateTournamentClick,
    handleJoinTournamentClick,
    handleLeaveTournamentClick,
    sortedParticipants,
    matchesByStage,
    latestReadyMatches,
    matchCountdowns,
    pendingMatch,
    countdownStatus,
    countdownSecondsDisplay,
    matchPhase,
    canvasRef,
    handleQuitMatch,
    isDetailView,
    headerRefreshHandler,
    headerLoading,
    currentParticipantId,
  } = useTournamentPageController({ focusTournamentId });

  const currentUserUuid = user?.uuid ?? null;
  const hasActiveTournament = activeTournamentId !== null;
  const shouldShowOverlay = matchPhase === 'starting' || matchPhase === 'playing';
  const overviewSectionClass = isDetailView
    ? 'grid gap-6'
    : 'grid gap-6 lg:grid-cols-[1.1fr_0.9fr]';

  if (userReady && !user) {
    return (
      <PageContainer>
        <PageSection>
          <h1 id="page-title" className="sr-only">
            Ping Pong Tournaments
          </h1>
          <div className="flex justify-center">
            <SurfaceCard className="w-full max-w-xl space-y-4 p-6 text-center shadow-2xl">
              <p className="text-base text-white">
                You need to be signed in before you can browse or join tournaments.
              </p>
              <p className="text-sm text-white/60">
                Log in to enter brackets, follow match progress, and receive directed invites.
              </p>
              <Button variant="primary" onClick={() => navigate('/login')}>
                Go to login
              </Button>
            </SurfaceCard>
          </div>
        </PageSection>
      </PageContainer>
    );
  }

  if (shouldShowOverlay) {
    return <PlayingView canvasRef={canvasRef} onQuit={handleQuitMatch} />;
  }

  return (
    <PageContainer>
      <PageSection>
        <SurfaceCard className="p-6 shadow-2xl">
          <TournamentPageHeader
            isDetailView={isDetailView}
            displayTournamentId={activeTournamentId}
            displayTournamentName={activeTournamentName}
            connectionReady={connectionReady}
            loading={headerLoading}
            onRefresh={() => headerRefreshHandler()}
            onLeaveTournament={isDetailView ? handleLeaveTournamentClick : undefined}
          />
        </SurfaceCard>

        <section className={overviewSectionClass}>
          {!isDetailView && (
            <TournamentLobbyPanel
              tournamentName={tournamentName}
              onTournamentNameChange={setTournamentName}
              onCreateTournament={handleCreateTournamentClick}
              connectionReady={connectionReady}
              availableTournaments={availableTournaments}
              activeTournamentId={activeTournamentId}
              aliasInput={aliasInput}
              onAliasInputChange={setAliasInput}
              onJoinTournament={handleJoinTournamentClick}
            />
          )}
          <TournamentParticipantsPanel
            participants={sortedParticipants}
            hasActiveTournament={hasActiveTournament}
            currentUserUuid={currentUserUuid}
          />
        </section>

        <TournamentBracketPanel
          matches={matchesByStage}
          hasActiveTournament={hasActiveTournament}
          tournamentStatus={tournamentStatus}
          currentParticipantId={currentParticipantId}
        />

        {hasActiveTournament && tournamentStatus !== 'completed' && (
          <TournamentDirectedMatchesPanel
            matches={latestReadyMatches}
            countdowns={matchCountdowns}
            pendingMatch={pendingMatch}
            pendingCountdownStatus={countdownStatus}
            pendingCountdownSeconds={countdownSecondsDisplay}
            currentUserUuid={currentUserUuid}
          />
        )}
      </PageSection>
    </PageContainer>
  );
};

export default TournamentPage;
