import React from 'react';

type PlayingViewProps = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onQuit: () => void;
};

export const PlayingView: React.FC<PlayingViewProps> = ({ canvasRef, onQuit }) => (
  <div className="relative h-screen w-full bg-black">
    <canvas ref={canvasRef} className="block h-full w-full" tabIndex={0} autoFocus />
    <button
      type="button"
      onClick={onQuit}
      className="game-quit-button absolute right-5 top-5 cursor-pointer"
      aria-label="Quit game"
    >
      Quit
      <span aria-hidden className="game-quit-hover-text">
        Quit
      </span>
    </button>
  </div>
);

export default PlayingView;
