import { useEffect } from 'react';
import type { Status } from '../state/types';

type Options = {
  status: Status;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onMatchOver: () => void;
  delayMs?: number;
};

export function useMatchOverListener({
  status,
  canvasRef,
  onMatchOver,
  delayMs = 3000,
}: Options) {
  useEffect(() => {
    if (status !== 'starting' && status !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let timer: number | null = null;

    const handler = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(onMatchOver, delayMs);
    };

    canvas.addEventListener('pong:matchOver', handler as EventListener);
    return () => {
      canvas.removeEventListener('pong:matchOver', handler as EventListener);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [status, canvasRef, onMatchOver, delayMs]);
}
