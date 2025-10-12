import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import gifImg from '../../assets/gif.mp4';
import { Card, PlayButton } from './pong-ui/local';

const PingPong: React.FC = () => {
  const navigate = useNavigate();

  const handleLocalPlay = () => navigate('/ping-pong/local');
  const handleOnlinePlay = () => navigate('/ping-pong/online');
  const handleTournaments = () => navigate('/ping-pong/tournaments');

  return (
    // Fixed, full-viewport layer with hidden overflow => no scrollbars
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      {/* Global site navigation (fixed). */}
      <Navbar />

      {/* Main landmark pinned between navbar and bottom */}
      <main
        aria-labelledby="page-title"
        className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)]"
      >
        {/* Decorative background video (letterboxed, centered). Hidden from ATs. */}
        <video
          className="absolute inset-0 z-0 h-full w-full object-co object-center pointer-events-none"
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
        >
          <source src={gifImg} type="video/mp4" />
        </video>

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
              <PlayButton size="lg" color="limegreen" onClick={handleLocalPlay} aria-label="Play local mode" type="button">
                PLAY LOCAL
              </PlayButton>

              <PlayButton size="lg" color="cyan" onClick={handleOnlinePlay} aria-label="Play online mode" type="button">
                PLAY ONLINE
              </PlayButton>

              <PlayButton size="lg" color="magenta" onClick={handleTournaments} aria-label="Enter tournament mode" type="button">
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
