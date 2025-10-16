import React from 'react';
import Navbar from '../../../components/Navbar';
import Button from '../../../components/Button';
import TournamentParticipantsPanel from './components/ParticipantsPanel';
import TournamentBracketPanel from './components/BracketPanel';
import TournamentDirectedMatchesPanel from './components/DirectedMatchesPanel';
import TournamentLobbyPanel from './components/LobbyPanel';
import TournamentMatchOverlay from './components/MatchOverlay';
import TournamentPageHeader from './components/PageHeader';
import SurfaceCard from '../shared/components/SurfaceCard';
import { BackgroundVideo } from '../shared/components/BackgroundVideo';
import { useTournamentPageController } from './hooks/useTournamentPageController';
import gifImg from '../../../assets/gif.mp4';

type TournamentPageProps = {
  onBack?: () => void;
  focusTournamentId?: number | null;
};

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
      <div className="flex min-h-screen flex-col items-center justify-center text-white">
        <Navbar />
        <div className="mt-24 text-center">
          <p className="mb-4 text-xl">Log in to join tournaments.</p>
          <Button variant="primary" onClick={() => navigate('/login')}>
            Go to login
          </Button>
        </div>
      </div>
    );
  }

  if (shouldShowOverlay) {
    return <TournamentMatchOverlay canvasRef={canvasRef} onQuit={handleQuitMatch} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <BackgroundVideo src={gifImg} fit="contain" position="center" />
      <Navbar />
      <div className="relative z-10 mx-auto mt-24 flex w-full max-w-6xl flex-col gap-6 px-4 pb-16">
        <SurfaceCard className="p-6 shadow-2xl">
          <TournamentPageHeader
            isDetailView={isDetailView}
            displayTournamentId={activeTournamentId}
            displayTournamentName={activeTournamentName}
            connectionReady={connectionReady}
            loading={loadingTournaments}
            onRefresh={headerRefreshHandler}
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
      </div>
    </div>
  );
};

export default TournamentPage;
