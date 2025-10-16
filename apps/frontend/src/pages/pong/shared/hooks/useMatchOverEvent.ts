import { useEffect, useRef } from 'react';

type UseMatchOverEventOptions<TDetail> = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  active: boolean;
  onMatchOver: (detail: TDetail | null) => void;
  onAutoExit?: () => void;
  autoExitDelayMs?: number;
  extractDetail?: (event: Event) => TDetail | null;
};

export function useMatchOverEvent<TDetail = unknown>({
  canvasRef,
  active,
  onMatchOver,
  onAutoExit,
  autoExitDelayMs = 3000,
  extractDetail,
}: UseMatchOverEventOptions<TDetail>) {
  const onMatchOverRef = useRef(onMatchOver);
  const onAutoExitRef = useRef(onAutoExit);
  const extractRef = useRef(extractDetail);

  useEffect(() => {
    onMatchOverRef.current = onMatchOver;
  }, [onMatchOver]);

  useEffect(() => {
    onAutoExitRef.current = onAutoExit;
  }, [onAutoExit]);

  useEffect(() => {
    extractRef.current = extractDetail;
  }, [extractDetail]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let timer: number | null = null;

    const handler = (event: Event) => {
      const detail = extractRef.current ? extractRef.current(event) : null;
      onMatchOverRef.current(detail);
      if (onAutoExitRef.current) {
        if (timer !== null) window.clearTimeout(timer);
        timer =
          autoExitDelayMs >= 0
            ? window.setTimeout(() => {
                onAutoExitRef.current?.();
              }, autoExitDelayMs)
            : null;
      }
    };

    canvas.addEventListener('pong:matchOver', handler);
    return () => {
      canvas.removeEventListener('pong:matchOver', handler);
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [active, canvasRef, autoExitDelayMs]);
}
