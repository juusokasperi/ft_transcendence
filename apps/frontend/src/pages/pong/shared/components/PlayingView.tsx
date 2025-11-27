import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[OnlineGame]', ...args);
  }
};

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

const getFullscreenElement = () => {
  if (typeof document === 'undefined') return null;
  const doc = document as any;
  return (
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement ||
    null
  );
};

const canElementFullscreen = (el: Element | null | undefined) => {
  if (!el) return false;
  const elAny = el as any;
  return Boolean(
    elAny.requestFullscreen ||
      elAny.webkitRequestFullscreen ||
      elAny.mozRequestFullScreen ||
      elAny.msRequestFullscreen,
  );
};

const isFullscreenApiSupported = () => {
  if (typeof document === 'undefined') return false;
  const doc = document as any;
  return Boolean(
    doc.fullscreenEnabled ||
      doc.webkitFullscreenEnabled ||
      doc.mozFullScreenEnabled ||
      doc.msFullscreenEnabled,
  );
};

export const PlayingView: React.FC<PlayingViewProps> = ({
  canvasRef,
  onQuit,
  aspect = defaultWorldAspect(),
}) => {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [isMobileLike, setIsMobileLike] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [touchControlsVisible, setTouchControlsVisible] = useState(false);
  const lastTapRef = React.useRef<number | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const focusCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas && typeof canvas.focus === 'function') {
      canvas.focus();
    }
  }, [canvasRef]);
  const lockLandscapeOrientation = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const screenAny = window.screen as any;
    const orientationApi = screenAny?.orientation;
    if (orientationApi && typeof orientationApi.lock === 'function') {
      await orientationApi.lock('landscape').catch(() => {});
      return;
    }
    const legacyLock =
      screenAny?.lockOrientation || screenAny?.mozLockOrientation || screenAny?.msLockOrientation;
    if (typeof legacyLock === 'function') {
      try {
        legacyLock.call(screenAny, 'landscape');
      } catch {
        // Ignore legacy lock failures.
      }
    }
  }, []);

  const unlockOrientation = useCallback(() => {
    if (typeof window === 'undefined') return;
    const screenAny = window.screen as any;
    const orientationApi = screenAny?.orientation;
    try {
      if (orientationApi && typeof orientationApi.unlock === 'function') {
        orientationApi.unlock();
      }
    } catch {
      // Ignore unlock errors; not all browsers support this.
    }
  }, []);

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
    if (typeof document === 'undefined') return;
    const checkSupport = () => {
      const el = rootRef.current ?? canvasRef.current;
      setFullscreenSupported(isFullscreenApiSupported() || canElementFullscreen(el));
    };
    checkSupport();
  }, [canvasRef]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const updateState = () => {
      setFullscreenActive(Boolean(getFullscreenElement()));
    };
    updateState();
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    events.forEach((event) => document.addEventListener(event, updateState));
    return () => {
      events.forEach((event) => document.removeEventListener(event, updateState));
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof MutationObserver === 'undefined') return;

    const updatePresence = () => {
      setTouchControlsVisible(Boolean(root.querySelector('.pong-touch-root')));
    };
    const observer = new MutationObserver(updatePresence);
    observer.observe(root, { childList: true, subtree: true });
    updatePresence();

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      unlockOrientation();
    };
  }, [unlockOrientation]);

  useEffect(() => {
    if (!fullscreenActive) {
      unlockOrientation();
    }
  }, [fullscreenActive, unlockOrientation]);

  useLayoutEffect(() => {
    focusCanvas();
  }, [focusCanvas]);

  const enterFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return false;
    const fullscreenTarget: any = rootRef.current ?? canvasRef.current;
    if (!fullscreenTarget) return false;

    try {
      if (!getFullscreenElement()) {
        const request =
          fullscreenTarget.requestFullscreen ||
          fullscreenTarget.webkitRequestFullscreen ||
          fullscreenTarget.mozRequestFullScreen ||
          fullscreenTarget.msRequestFullscreen;
        if (!request) {
          return false;
        }
        await request.call(fullscreenTarget);
      }
      await lockLandscapeOrientation();
      focusCanvas();
      return true;
    } catch (error) {
      if (import.meta.env?.DEV) {
        debugLog('[PlayingView] Failed to enter fullscreen', error);
      }
      return false;
    }
  }, [canvasRef, focusCanvas, lockLandscapeOrientation]);

  const exitFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const docAny = document as any;
    try {
      if (docAny.exitFullscreen) {
        await docAny.exitFullscreen();
      } else if (docAny.webkitExitFullscreen) {
        await docAny.webkitExitFullscreen();
      } else if (docAny.mozCancelFullScreen) {
        await docAny.mozCancelFullScreen();
      } else if (docAny.msExitFullscreen) {
        await docAny.msExitFullscreen();
      }
    } catch (error) {
      if (import.meta.env?.DEV) {
        debugLog('[PlayingView] Failed to exit fullscreen', error);
      }
    } finally {
      unlockOrientation();
      focusCanvas();
    }
  }, [focusCanvas, unlockOrientation]);

  const handleFullscreenToggle = useCallback(async () => {
    if (fullscreenActive) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
    focusCanvas();
  }, [enterFullscreen, exitFullscreen, focusCanvas, fullscreenActive]);

  const canvasStyle = useMemo<React.CSSProperties>(
    () => ({ width: `${size.w}px`, height: `${size.h}px` }),
    [size],
  );

  const handleCanvasPointerUp = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMobile()) return;
    if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;

    const now = performance.now();
    const last = lastTapRef.current;
    lastTapRef.current = now;

    if (last == null || now - last > 300) {
      return;
    }

    if (fullscreenSupported) {
      await enterFullscreen();
    }
  };

  const showRotateOverlay = isMobileLike && orientation === 'portrait';

  return (
    <>
      <div
        ref={rootRef}
        className="pong-game-root fixed inset-0 z-[1000] bg-black"
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

        {(fullscreenSupported || fullscreenActive) && !touchControlsVisible && (
          <button
            type="button"
            onClick={handleFullscreenToggle}
            className="absolute bottom-5 left-5 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-pressed={fullscreenActive}
          >
            {fullscreenActive ? 'X Fullscreen' : 'Fullscreen'}
          </button>
        )}
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
