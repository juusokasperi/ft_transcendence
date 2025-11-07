import { useEffect, useMemo, useState } from 'react';
import type { CountdownSnapshot, ReadyMatch } from '../state/types';

type Options = {
  pendingMatch: ReadyMatch | null;
  matchCountdowns: Map<number, CountdownSnapshot>;
};

export function useMatchCountdown({ pendingMatch, matchCountdowns }: Options) {
  const pendingCountdown = useMemo(() => {
    return pendingMatch ? matchCountdowns.get(pendingMatch.tournamentMatchId) : undefined;
  }, [matchCountdowns, pendingMatch]);

  const [localSeconds, setLocalSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!pendingCountdown) {
      setLocalSeconds(null);
      return;
    }

    if (pendingCountdown.status !== 'running') {
      setLocalSeconds(pendingCountdown.secondsRemaining);
      return;
    }

    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((pendingCountdown.targetStartEpochMs - Date.now()) / 1000),
      );
      setLocalSeconds(remaining);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pendingCountdown]);

  const countdownStatus = pendingCountdown?.status ?? null;
  const countdownSecondsDisplay =
    pendingCountdown?.status === 'running'
      ? (localSeconds ?? pendingCountdown?.secondsRemaining ?? null)
      : (pendingCountdown?.secondsRemaining ?? null);

  return { countdownStatus, countdownSecondsDisplay } as const;
}
