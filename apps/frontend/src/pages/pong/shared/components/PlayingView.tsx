import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { TABLE_LENGTH_X, TABLE_WIDTH_Z, isMobile } from '@pong/render';

type PlayingViewProps = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onQuit: () => void;
  aspect?: number;
};

type Orientation = 'portrait' | 'landscape';

const PAD_X = 0.2;
const PAD_Z = 0.2;

function defaultWorldAspect(): number {
  const framedX = TABLE_LENGTH_X / 2 + PAD_X;
  const framedZ = TABLE_WIDTH_Z / 2 + PAD_Z;
  return framedX / framedZ;
}

function containSize(viewW: number, viewH: number, aspect: number) {
  if (viewW <= 0 || viewH <= 0 || aspect <= 0) return { w: 0, h: 0 };
  let w = viewW;
  let h = Math.round(w / aspect);
  if (h > viewH) {
    h = viewH;
    w = Math.round(h * aspect);
  }
  return { w, h };
}

export const PlayingView: React.FC<PlayingViewProps> = ({
  canvasRef,
  onQuit,
  aspect = defaultWorldAspect(),
}) => {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [isMobileLike, setIsMobileLike] = useState(false);
  const [orientationLockAttempted, setOrientationLockAttempted] = useState(false);
  const lastTapRef = React.useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const next = containSize(W, H, aspect);
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));

      const nextOrientation: Orientation = W >= H ? 'landscape' : 'portrait';
      setOrientation((prev) => (prev === nextOrientation ? prev : nextOrientation));

      const mobileLike = isMobile();
      setIsMobileLike((prev) => (prev === mobileLike ? prev : mobileLike));
    };
    update();
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [aspect]);

  useEffect(() => {
    if (!isMobileLike) return;
    if (orientationLockAttempted) return;

    let cancelled = false;

    const tryLockOrientation = async () => {
      const screenAny = window.screen as any;
      const orientationApi = screenAny?.orientation;

      try {
        if (orientationApi && typeof orientationApi.lock === 'function') {
          await orientationApi.lock('landscape');
          if (!cancelled) {
            setOrientationLockAttempted(true);
          }
          return;
        }

        const legacyLock =
          screenAny?.lockOrientation ||
          screenAny?.mozLockOrientation ||
          screenAny?.msLockOrientation;
        if (typeof legacyLock === 'function') {
          legacyLock.call(screenAny, 'landscape');
          if (!cancelled) {
            setOrientationLockAttempted(true);
          }
        }
      } catch (error) {
        console.warn('[PlayingView] Failed to lock orientation to landscape', error);
      }
    };

    tryLockOrientation();

    return () => {
      cancelled = true;
      const screenAny = window.screen as any;
      const orientationApi = screenAny?.orientation;
      try {
        if (orientationApi && typeof orientationApi.unlock === 'function') {
          orientationApi.unlock();
        }
      } catch {
        // Ignore unlock errors; not all browsers support this.
      }
    };
  }, [isMobileLike, orientationLockAttempted]);

  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (c && typeof c.focus === 'function') c.focus();
  }, [canvasRef]);

  const canvasStyle = useMemo<React.CSSProperties>(
    () => ({ width: `${size.w}px`, height: `${size.h}px` }),
    [size],
  );

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMobile()) return;
    if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;

    const now = performance.now();
    const last = lastTapRef.current;
    lastTapRef.current = now;

    if (last == null || now - last > 300) {
      return;
    }

    const el = canvasRef.current;
    if (!el) return;

    const anyEl = el as any;
    try {
      if (anyEl.requestFullscreen) {
        anyEl.requestFullscreen();
      } else if (anyEl.webkitRequestFullscreen) {
        anyEl.webkitRequestFullscreen();
      } else if (anyEl.mozRequestFullScreen) {
        anyEl.mozRequestFullScreen();
      } else if (anyEl.msRequestFullscreen) {
        anyEl.msRequestFullscreen();
      }
    } catch (error) {
      // Silently ignore fullscreen errors on unsupported/mobile browsers.
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[PlayingView] Failed to enter fullscreen', error);
      }
    }
  };

  const showRotateOverlay = isMobileLike && orientation === 'portrait';

  return (
    <>
      <div
        className="fixed inset-0 z-[1000] bg-black"
        role="application"
        aria-label="Pong game"
        aria-describedby="pong-kb-instructions"
      >
        <p id="pong-kb-instructions" className="sr-only">
          Game view captures keyboard focus. Use the Quit button or press Escape (when supported) to
          exit the game.
        </p>
        <div className="absolute inset-0 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="block outline-none"
            style={canvasStyle}
            tabIndex={0}
            onPointerUp={handleCanvasPointerUp}
          />
        </div>

        <button
          type="button"
          onClick={onQuit}
          className="game-quit-button absolute right-5 top-5 cursor-pointer"
          aria-label="Quit game"
          title="Press Esc to quit"
        >
          Quit
          <span aria-hidden className="game-quit-hover-text">
            Quit
          </span>
        </button>
      </div>

      {showRotateOverlay
        ? createPortal(
            <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black px-6 text-center">
              <p className="mb-3 text-lg font-semibold text-white">Rotate your device</p>
              <p className="max-w-xs text-sm text-white/70">
                Please rotate your device to landscape to continue playing Pong.
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};

export default PlayingView;
