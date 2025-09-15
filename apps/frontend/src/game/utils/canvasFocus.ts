export function setupCanvasFocus(canvas: HTMLCanvasElement): () => void {
  const focusCanvas = () => {
    if (document.activeElement !== canvas) {
      canvas.focus({ preventScroll: true });
    }
  };

  const focusSoon = () => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => focusCanvas());
    } else {
      setTimeout(() => focusCanvas(), 0);
    }
  };

  focusSoon();

  const handlePointerDown = () => {
    focusCanvas();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      focusSoon();
    }
  };

  canvas.addEventListener('pointerdown', handlePointerDown);
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    canvas.removeEventListener('pointerdown', handlePointerDown);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}