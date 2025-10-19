import { useEffect } from 'react';
import type React from 'react';
import { useMatchOverEvent } from '../../shared/hooks/useMatchOverEvent';
import type { MatchSummary } from '../types';

type Args = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  playing: boolean;
  onSummary: (summary: MatchSummary) => void;
  onAutoExit: () => void;
};

export function useLocalMatchEnd({ canvasRef, playing, onSummary, onAutoExit }: Args) {
  useMatchOverEvent<MatchSummary>({
    canvasRef,
    active: playing,
    onMatchOver: (detail) => {
      if (detail) onSummary(detail);
    },
    onAutoExit,
    autoExitDelayMs: 0,
    extractDetail: (event) => (event as CustomEvent<MatchSummary>).detail ?? null,
  });

  // No return value; hook only wires events.
  useEffect(() => {}, []);
}
