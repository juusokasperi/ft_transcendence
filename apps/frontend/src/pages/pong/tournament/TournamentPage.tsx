import React from 'react';
import Button from '../../../components/Button';
import TournamentParticipantsPanel from './components/ParticipantsPanel';
import TournamentBracketPanel from './components/BracketPanel';
import TournamentDirectedMatchesPanel from './components/DirectedMatchesPanel';
import TournamentLobbyPanel from './components/LobbyPanel';
import TournamentPageHeader from './components/PageHeader';
import ConfirmDialog from '../../../components/ConfirmDialog';
import SurfaceCard from '../shared/components/SurfaceCard';
import PlayingView from '../shared/components/PlayingView';
import { useTournamentPageController } from './hooks/useTournamentPageController';
import PageContainer from '../shared/components/PageContainer';
import PageSection from '../shared/components/PageSection';
import TournamentChatAnnouncer from './components/TournamentChatAnnouncer';
import { Spinner } from '@ft/spinner';
type TournamentPageProps = {
  onBack?: () => void;
  focusTournamentId?: number | null;
};

// Moved ChatToggleButton to a shared component for reuse

const TournamentPage: React.FC<TournamentPageProps> = ({ focusTournamentId = null }) => {
  const {
    user,
    userReady,
    navigate,
    connectionReady,
    availableTournaments,
    activeTournamentId,
    activeTournamentName,
    tournamentStatus,
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
    forfeitedParticipantIds,
    resumePromptOpen,
    handleResumePromptConfirm,
    handleResumePromptDismiss,
  } = useTournamentPageController({ focusTournamentId });

  const currentUserUuid = user?.uuid ?? null;
  const firstPlayer = pendingMatch?.participants?.at(0)?.alias ?? null;
  const secondPlayer = pendingMatch?.participants?.at(1)?.alias ?? null;
  const stage = pendingMatch?.stage ?? null;
  const participantUuids =
    pendingMatch?.participants?.map((p) => p.userUuid).filter((id): id is string => Boolean(id)) ??
    [];
  const hasActiveTournament = activeTournamentId !== null;
  const shouldShowOverlay = matchPhase === 'starting' || matchPhase === 'playing';
  // Only the lobby is shown on the main page; use a single-column layout there.
  // Participants sit alone in detail view; keep it single-column as well.
  const overviewSectionClass = 'mt-4 grid gap-6';
  const detailsSectionClass = 'mt-4 grid gap-4';
  const isTournamentNameLoading = Boolean(isDetailView && headerLoading && !activeTournamentName);

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
                You need to be signed in and logged in before you can create or join tournaments.
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

  if (isTournamentNameLoading) {
    return (
      <PageContainer>
        <PageSection>
          <div className="flex h-64 items-center justify-center">
            <Spinner size={64} color="#A855F7" aria-label="Loading tournament" />
          </div>
        </PageSection>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageSection>
        <SurfaceCard className="p-6 shadow-2xl">
          <TournamentPageHeader
            isDetailView={isDetailView}
            displayTournamentName={activeTournamentName}
            tournamentStatus={tournamentStatus}
            connectionReady={connectionReady}
            loading={headerLoading}
            onRefresh={() => headerRefreshHandler()}
            onLeaveTournament={isDetailView ? handleLeaveTournamentClick : undefined}
          />
        </SurfaceCard>

        {!isDetailView && (
          <section className={overviewSectionClass}>
            <TournamentLobbyPanel
              tournamentName={tournamentName}
              onTournamentNameChange={setTournamentName}
              onCreateTournament={handleCreateTournamentClick}
              connectionReady={connectionReady}
              availableTournaments={availableTournaments}
              activeTournamentId={activeTournamentId}
              onJoinTournament={handleJoinTournamentClick}
            />
          </section>
        )}

        {isDetailView && (
          <section className={detailsSectionClass}>
            <TournamentParticipantsPanel
              participants={sortedParticipants}
              hasActiveTournament={hasActiveTournament}
              currentUserUuid={currentUserUuid}
              tournamentStatus={tournamentStatus}
              forfeitedParticipantIds={forfeitedParticipantIds}
            />
            <TournamentBracketPanel
              matches={matchesByStage}
              hasActiveTournament={hasActiveTournament}
              tournamentStatus={tournamentStatus}
              currentParticipantId={currentParticipantId}
              forfeitedParticipantIds={forfeitedParticipantIds}
            />

            {hasActiveTournament && pendingMatch && (
              <TournamentChatAnnouncer
                firstPlayer={firstPlayer}
                secondPlayer={secondPlayer}
                stage={stage}
                participantUuids={participantUuids}
              />
            )}
            {hasActiveTournament && tournamentStatus !== 'completed' && (
              <TournamentDirectedMatchesPanel
                matches={latestReadyMatches}
                countdowns={matchCountdowns}
                pendingMatch={pendingMatch}
                pendingCountdownStatus={countdownStatus}
                pendingCountdownSeconds={countdownSecondsDisplay}
                currentUserUuid={currentUserUuid}
                forfeitedParticipantIds={forfeitedParticipantIds}
              />
            )}
          </section>
        )}
      </PageSection>

      <ConfirmDialog
        open={resumePromptOpen}
        title="Resume previous online match?"
        description="You have a resumable online match. Continue to tournaments and clear the resume token, or cancel to keep it."
        confirmLabel="Continue to tournaments"
        cancelLabel="Cancel"
        onConfirm={handleResumePromptConfirm}
        onCancel={handleResumePromptDismiss}
        tone="warning"
      />
    </PageContainer>
  );
};

export default TournamentPage;
