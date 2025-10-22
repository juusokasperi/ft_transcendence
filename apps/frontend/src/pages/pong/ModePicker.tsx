// apps/frontend/src/pages/pong/ModePicker.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, PlayButton } from './local/components';

const ModePicker: React.FC = () => {
  const navigate = useNavigate();

  // Use relative paths because this component is nested under /pong3d
  const handleLocalPlay = () => navigate('local');
  const handleOnlinePlay = () => navigate('online');
  const handleTournaments = () => navigate('tournaments');

  return (
    <section
      aria-labelledby="modes-heading"
      className="grid"
    >
      <Card
        title={
          <h1 id="page-title-modes-picker" className="block text-center text-2xl font-semibold">
            PONG3D
          </h1>
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
  );
};

export default ModePicker;
