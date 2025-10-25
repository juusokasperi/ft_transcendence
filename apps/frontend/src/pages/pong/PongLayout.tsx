// apps/frontend/src/pages/pong/PongLayout.tsx
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { BackgroundVideo } from './shared/components/BackgroundVideo';
import gifImg from '../../assets/gif.mp4';
import PageContainer from './shared/components/PageContainer';
import PageSection from './shared/components/PageSection';

export default function PongLayout() {
  return (
    <div id="pong-shell" className="fixed inset-0 text-white">
      <header>
        <Navbar />
      </header>

      <main
        aria-labelledby="page-title"
        aria-label="PONG"
        className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)] overflow-y-auto"
      >
        <BackgroundVideo src={gifImg} fit="contain" position="center" />
        <section
          id="page-content"
          aria-labelledby="page-title"
          className="relative z-10 min-h-full pb-[env(safe-area-inset-bottom)]"
        >
          <Suspense
            fallback={
              <PageContainer>
                <PageSection>
                  <div className="text-white/80">Loading…</div>
                </PageSection>
              </PageContainer>
            }
          >
            <Outlet />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
