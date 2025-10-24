// apps/frontend/src/pages/pong/ModePicker.tsx
import React, { useEffect } from 'react';
import { Card, PlayButton } from './local/components';
import PageContainer from './shared/components/PageContainer';
import PageHeader from './shared/components/PageHeader';
import PageSection from './shared/components/PageSection';
import { preloadLocalPong } from './local/hooks/usePongRuntime';
import { preloadOnlinePong } from './online/hooks/useGameBootstrap';

const ModePicker: React.FC = () => {
  useEffect(() => {
    const run = () => {
      preloadLocalPong();
      preloadOnlinePong();
    };
    // Defer to idle time to avoid competing with initial render
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    };
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(run, { timeout: 1500 })
      : window.setTimeout(run, 600);
    return () => {
      if (!w.requestIdleCallback) {
        window.clearTimeout(id as unknown as number);
      }
    };
  }, []);

  return (
    <PageContainer>
      <PageSection>
        <PageHeader id="page-title" title="PONG3D" align="center" />

        <Card>
          <nav
            aria-label="Choose a game mode"
            className="mt-2 flex flex-col items-center gap-4 landscape:flex-row landscape:justify-center landscape:gap-6"
          >
            <PlayButton
              size="lg"
              color="limegreen"
              to="local"
              aria-label="Play local mode"
              responsiveCompact
              onMouseEnter={() => preloadLocalPong()}
              onFocus={() => preloadLocalPong()}
            >
              PLAY LOCAL
            </PlayButton>

            <PlayButton
              size="lg"
              color="cyan"
              to="online"
              aria-label="Play online mode"
              responsiveCompact
              onMouseEnter={() => preloadOnlinePong()}
              onFocus={() => preloadOnlinePong()}
            >
              PLAY ONLINE
            </PlayButton>

            <PlayButton
              size="lg"
              color="magenta"
              to="tournaments"
              aria-label="Enter tournament mode"
              responsiveCompact
              onMouseEnter={() => preloadOnlinePong()}
              onFocus={() => preloadOnlinePong()}
            >
              TOURNAMENT
            </PlayButton>
          </nav>
        </Card>
      </PageSection>
    </PageContainer>
  );
};

export default ModePicker;
