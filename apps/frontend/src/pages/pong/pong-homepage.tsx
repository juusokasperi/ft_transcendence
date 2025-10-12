import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { BackgroundVideo } from './pong-ui/background-video';
import gifImg from '../../assets/gif.mp4';
import { Card, PlayButton } from './local/components';

const PingPong: React.FC = () => {
  const navigate = useNavigate();

  const handleLocalPlay = () => navigate('/ping-pong/local');
  const handleOnlinePlay = () => navigate('/ping-pong/online');
  const handleTournaments = () => navigate('/ping-pong/tournaments');

  return (
    // Fixed, full-viewport layer with hidden overflow => no scrollbars
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      {/* Global site navigation (fixed). */}
      <Navbar />

      {/* Main landmark pinned between navbar and bottom */}
      <main
        aria-labelledby="page-title"
        className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)]"
      >
        {/* Decorative background video (letterboxed, centered). Hidden from ATs. */}
        <BackgroundVideo src={gifImg} fit="contain" position="center" />

        {/* Page title (accessible) */}
        <h1 id="page-title" className="sr-only">
          Pong 3D Game Modes
        </h1>

        {/* Section: game mode selection */}
        <section
          aria-labelledby="modes-heading"
          className="relative z-10 flex h-full w-full flex-col items-center p-6"
        >
          <Card
            title={
              <span id="modes-heading" className="block w-full text-center text-2xl font-semibold">
                PONG3D
              </span>
            }
          >
            <nav aria-label="Choose a game mode" className="mt-6 flex flex-col items-center gap-4">
              <PlayButton
                size="lg"
                color="limegreen"
                onClick={handleLocalPlay}
                aria-label="Play local mode"
                type="button"
              >
                PLAY LOCAL
              </PlayButton>

              <PlayButton
                size="lg"
                color="cyan"
                onClick={handleOnlinePlay}
                aria-label="Play online mode"
                type="button"
              >
                PLAY ONLINE
              </PlayButton>

              <PlayButton
                size="lg"
                color="magenta"
                onClick={handleTournaments}
                aria-label="Enter tournament mode"
                type="button"
              >
                TOURNAMENT
              </PlayButton>
            </nav>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default PingPong;
