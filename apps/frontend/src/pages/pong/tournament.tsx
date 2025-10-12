import React from 'react';
import Navbar from '../../components/Navbar';
import Button from '../../components/Button';
import TournamentParticipantsPanel from './pong-ui/tournament/TournamentParticipantsPanel';
import TournamentBracketPanel from './pong-ui/tournament/TournamentBracketPanel';
import TournamentDirectedMatchesPanel from './pong-ui/tournament/TournamentDirectedMatchesPanel';
import TournamentLobbyPanel from './pong-ui/tournament/TournamentLobbyPanel';
import TournamentMatchOverlay from './pong-ui/tournament/TournamentMatchOverlay';
import TournamentPageHeader from './pong-ui/tournament/TournamentPageHeader';
import { useTournamentPageController } from './hooks/useTournamentPageController';

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
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
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
    <div className="relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <Navbar />
      <div className="mx-auto mt-24 flex w-full max-w-6xl flex-col gap-6 px-4 pb-16">
        <TournamentPageHeader
          isDetailView={isDetailView}
          displayTournamentId={activeTournamentId}
          displayTournamentName={activeTournamentName}
          connectionReady={connectionReady}
          loading={loadingTournaments}
          onRefresh={headerRefreshHandler}
          onLeaveTournament={isDetailView ? handleLeaveTournamentClick : undefined}
        />

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
