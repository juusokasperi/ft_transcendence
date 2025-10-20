import { useLayoutEffect } from 'react';

export function useCanvasAutofocus(
  active: boolean,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  useLayoutEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const id = requestAnimationFrame(() => {
      canvas.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [active, canvasRef]);
}
