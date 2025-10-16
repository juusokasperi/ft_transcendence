import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { BackgroundVideo } from './shared/components/BackgroundVideo';
import gifImg from '../../assets/gif.mp4';
import { Card, PlayButton } from './local/components';

const PingPong: React.FC = () => {
  const navigate = useNavigate();

  const handleLocalPlay = () => navigate('/ping-pong/local');
  const handleOnlinePlay = () => navigate('/ping-pong/online');
  const handleTournaments = () => navigate('/ping-pong/tournaments');

  return (
    // Fixed, full-viewport layer with hidden overflow => no scrollbars
    <div className="fixed inset-0 overflow-hidden text-white">
      {/* Global site navigation (fixed). */}
      <Navbar />

      {/* Main landmark pinned between navbar and bottom */}
      <main
        aria-labelledby="page-title"
        className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)] overflow-y-auto"
      >
        {/* Decorative background video (letterboxed, centered). Hidden from ATs. */}
        <BackgroundVideo src={gifImg} fit="contain" position="center" />

        {/* Page title (accessible) */}
        <h1 id="page-title" className="sr-only">
          Pong 3D Game Modes
        </h1>

        {/* Section: game mode selection */}
        <section aria-labelledby="modes-heading" className="z-10 grid place-items-center p-4">
          <Card
            title={
              <span id="modes-heading" className="block text-center text-2xl font-semibold">
                PONG3D
              </span>
            }
          >
            <nav
              aria-label="Choose a game mode"
              className="mt-6 flex flex-col items-center gap-4 landscape:flex-row landscape:justify-center landscape:gap-6"
            >
              <PlayButton
                size="lg"
                color="limegreen"
                onClick={handleLocalPlay}
                aria-label="Play local mode"
                type="button"
                className="max-[800px]:!h-[3.5em] max-[800px]:!min-w-[10em] max-[800px]:!text-[16px]"
              >
                PLAY LOCAL
              </PlayButton>

              <PlayButton
                size="lg"
                color="cyan"
                onClick={handleOnlinePlay}
                aria-label="Play online mode"
                type="button"
                className="max-[800px]:!h-[3.5em] max-[800px]:!min-w-[10em] max-[800px]:!text-[16px]"
              >
                PLAY ONLINE
              </PlayButton>

              <PlayButton
                size="lg"
                color="magenta"
                onClick={handleTournaments}
                aria-label="Enter tournament mode"
                type="button"
                className="max-[800px]:!h-[3.5em] max-[800px]:!min-w-[10em] max-[800px]:!text-[16px]"
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
