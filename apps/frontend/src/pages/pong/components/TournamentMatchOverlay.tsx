import React from 'react';
import Navbar from '../../../components/Navbar';

export type TournamentMatchOverlayProps = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onQuit(): void;
};

const TournamentMatchOverlay: React.FC<TournamentMatchOverlayProps> = ({ canvasRef, onQuit }) => {
  return (
    <div className="relative min-h-screen w-full bg-black">
      <Navbar />
      <canvas ref={canvasRef} className="block h-full w-full" tabIndex={0} autoFocus />
      <button
        type="button"
        onClick={onQuit}
        className="game-quit-button absolute right-5 top-5"
        aria-label="Quit match"
      >
        Quit
        <span aria-hidden className="game-quit-hover-text">
          Quit
        </span>
      </button>
    </div>
  );
};

export default TournamentMatchOverlay;
