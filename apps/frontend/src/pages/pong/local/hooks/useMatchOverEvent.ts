import { useEffect, useRef } from 'react';
import type { GameHistoryEntry } from '@pong/shared';

type MatchOverDetail = {
  winner: 'east' | 'west';
  bestOf: number;
  gamesHistory: GameHistoryEntry[];
  names: { east: string; west: string };
};

type UseMatchOverEventOptions = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  playing: boolean;
  onMatchOver: (detail: MatchOverDetail) => void;
  onAutoExit: () => void;
  autoExitDelayMs?: number;
};

export function useMatchOverEvent({
  canvasRef,
  playing,
  onMatchOver,
  onAutoExit,
  autoExitDelayMs = 3000,
}: UseMatchOverEventOptions) {
  const onMatchOverRef = useRef(onMatchOver);
  const onAutoExitRef = useRef(onAutoExit);

  useEffect(() => {
    onMatchOverRef.current = onMatchOver;
  }, [onMatchOver]);

  useEffect(() => {
    onAutoExitRef.current = onAutoExit;
  }, [onAutoExit]);

  useEffect(() => {
    if (!playing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let timer: number | null = null;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<MatchOverDetail>).detail;
      if (!detail) return;
      onMatchOverRef.current(detail);
      if (autoExitDelayMs >= 0) {
        timer = window.setTimeout(() => {
          onAutoExitRef.current();
        }, autoExitDelayMs);
      }
    };

    canvas.addEventListener('pong:matchOver', handler as EventListener);
    return () => {
      canvas.removeEventListener('pong:matchOver', handler as EventListener);
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [playing, canvasRef, onMatchOver, onAutoExit, autoExitDelayMs]);
}
