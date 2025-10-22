// apps/src/pages/pong/PongLayout.tsx
import { Outlet } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { BackgroundVideo } from './shared/components/BackgroundVideo';
import gifImg from '../../assets/gif.mp4';

export default function PongLayout() {
  return (
    /**
     * App shell pinned to the viewport.
     * - fixed       → position: fixed (sticks to the viewport; doesn't scroll)
     * - inset-0     → top/right/bottom/left: 0 (fill full viewport)
     * - text-white  → default text color for descendants
     */
    <div id="pong-shell" className="fixed inset-0 text-white">
      {/* Site-wide header; keep semantics explicit for screen readers */}
      <header>
        <Navbar />
      </header>

      {/**
       * Single page <main> landmark for the entire Pong area.
       * - absolute                     → positioned inside the fixed shell
       * - inset-x-0                    → left/right: 0 (full width)
       * - top-[var(--navbar-h,80px)]   → respect navbar height (CSS var with 80px fallback)
       * - bottom-0                     → extend to bottom edge
       * - overflow-y-auto              → inner scrolling region; header remains fixed
       */}
      <main
        aria-labelledby="page-title"
        className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)] overflow-y-auto"
      >
        {/* Decorative background layer behind content. */}
        <BackgroundVideo src={gifImg} fit="contain" position="center" />

        {/**
         * Foreground content host for routed pages.
         * - relative       → establishes a stacking context for z-10
         * - z-10           → ensure above the background video plane
         * - min-h-full     → at least fill the available main height
         * - flex           → center child (the routed page) horizontally
         * - justify-center → center along the main axis (horizontal here)
         * - items-start    → align items to the top (no vertical centering)
         * - pt-4           → small gap under the navbar
         * - pb-8           → breathing room at the bottom for tall content
         * - px-4           → side padding on small screens
         *
         */}
        <section
          id="page-content"
          aria-labelledby="page-title"
          className="relative z-10 min-h-full flex justify-center items-start p-4"
        >
          {/* Child routes render here. Each child should constrain its width */}
          <Outlet />
        </section>
      </main>
    </div>
  );
}
