import React, { useEffect, useState } from 'react';
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
import Chat from 'apps/frontend/src/components/Chat';

type TournamentPageProps = {
  onBack?: () => void;
  focusTournamentId?: number | null;
};

function ChatToggleButton({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setOpen(!open)}
      aria-label="Toggle chat"
      className="z-60 fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/90 text-white shadow-lg hover:bg-indigo-500"
      title={open ? 'Close chat' : 'Open chat'}
    >
      💬
    </button>
  );
}

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

  const firstPlayer = pendingMatch?.participants?.at(0)?.alias;
  const secondPlayer = pendingMatch?.participants?.at(1)?.alias;
  const stage = pendingMatch?.stage;
  const [chatOpen, setChatOpen] = useState(false);
  const currentUserUuid = user?.uuid ?? null;
  const hasActiveTournament = activeTournamentId !== null;
  const shouldShowOverlay = matchPhase === 'starting' || matchPhase === 'playing';
  const overviewSectionClass = isDetailView
    ? 'grid gap-6'
    : 'grid gap-6 lg:grid-cols-[1.1fr_0.9fr]';

  useEffect(() => {
    setChatOpen(true);
  }, []);
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

        {user && !chatOpen && <ChatToggleButton open={chatOpen} setOpen={setChatOpen} />}

        {/* Keep Chat mounted to avoid StrictMode remount flicker */}
        {user && (
          <Chat
            onClose={() => setChatOpen(false)}
            channel={activeTournamentId ? `Tournaments-${activeTournamentId}` : 'Pong Tournaments'}
            isOpen={chatOpen}
            firstPlayer={firstPlayer}
            secondPlayer={secondPlayer}
            stage={stage}
          />
        )}
      </PageSection>
    </PageContainer>
  );
};

export default TournamentPage;
