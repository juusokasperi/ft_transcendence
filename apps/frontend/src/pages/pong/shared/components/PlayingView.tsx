import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { TABLE_LENGTH_X, TABLE_WIDTH_Z } from '@pong/render';

type PlayingViewProps = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onQuit: () => void;
  aspect?: number;
};

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

  useEffect(() => {
    const update = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const next = containSize(W, H, aspect);
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };
    update();
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [aspect]);

  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (c && typeof c.focus === 'function') c.focus();
  }, [canvasRef]);

  const canvasStyle = useMemo<React.CSSProperties>(
    () => ({ width: `${size.w}px`, height: `${size.h}px` }),
    [size],
  );

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black"
      role="application"
      aria-label="Pong game"
      aria-describedby="pong-kb-instructions"
    >
      <p id="pong-kb-instructions" className="sr-only">
        Game view captures keyboard focus. Use the Quit button or press Escape (when supported) to exit the game.
      </p>
      <div className="absolute inset-0 flex items-center justify-center">
        <canvas ref={canvasRef} className="block outline-none" style={canvasStyle} tabIndex={0} />
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
  );
};

export default PlayingView;
