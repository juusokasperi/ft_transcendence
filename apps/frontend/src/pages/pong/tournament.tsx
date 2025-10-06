import React from 'react';
import Navbar from '../../components/Navbar';
import Button from '../../components/Button';
import TournamentParticipantsPanel from './components/TournamentParticipantsPanel';
import TournamentBracketPanel from './components/TournamentBracketPanel';
import TournamentDirectedMatchesPanel from './components/TournamentDirectedMatchesPanel';
import TournamentLobbyPanel from './components/TournamentLobbyPanel';
import TournamentMatchOverlay from './components/TournamentMatchOverlay';
import TournamentPageHeader from './components/TournamentPageHeader';
import { useTournamentPageController } from './hooks/useTournamentPageController';

const TournamentPage: React.FC = () => {
  const {
    user,
    userReady,
    navigate,
    connectionReady,
    loadingTournaments,
    availableTournaments,
    activeTournamentId,
    tournamentStatus,
    aliasInput,
    setAliasInput,
    tournamentName,
    setTournamentName,
    handleCreateTournamentClick,
    handleJoinTournamentClick,
    handleLeaveTournamentClick,
    handleForfeitTournamentClick,
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
  } = useTournamentPageController();

  const currentUserUuid = user?.uuid ?? null;
  const hasActiveTournament = activeTournamentId !== null;
  const shouldShowOverlay = matchPhase === 'starting' || matchPhase === 'playing';

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
          connectionReady={connectionReady}
          loading={loadingTournaments}
          onRefresh={headerRefreshHandler}
        />

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
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
            onLeaveTournament={handleLeaveTournamentClick}
            onForfeitTournament={handleForfeitTournamentClick}
            canForfeit={tournamentStatus === 'active'}
          />

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

        {hasActiveTournament && (
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
