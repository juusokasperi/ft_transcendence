import { useEffect, useRef, useState } from 'react';
import type { Status } from '../state/types';

const TICK_MS = 1000;

export function useQueueTimer(status: Status): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== 'in_queue') {
      startRef.current = null;
      setElapsedSeconds(0);
      return;
    }

    startRef.current = Date.now();
    setElapsedSeconds(0);

    const tick = () => {
      const startedAt = startRef.current;
      if (startedAt === null) return;
      const diff = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(diff);
    };

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [status]);

  return elapsedSeconds;
}
