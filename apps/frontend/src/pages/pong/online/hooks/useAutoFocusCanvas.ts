import { useLayoutEffect } from 'react';
import type { Status } from '../state/types';

export function useAutoFocusCanvas(
  status: Status,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  useLayoutEffect(() => {
    if (status !== 'starting' && status !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const id = requestAnimationFrame(() => {
      canvas.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [status, canvasRef]);
}
