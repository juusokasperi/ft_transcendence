import type { DomScoreboardAPI } from '@pong/render';
import type { RoomStateMessage } from '@pong/shared/protocol/net';
import type { MatchSnapshot } from '@pong/shared';
import type { OnlineMatchSummary } from './types';
import { createLatencyWarning } from './latency';

const WAITING_MIN_TIMEOUT_MS = 8000;
const WAITING_MAX_TIMEOUT_MS = 10000;
const WAITING_EXTRA_GRACE_MS = 1000;

export type MatchLifecycleDeps = {
  hud: DomScoreboardAPI;
  getNames: () => { east: string; west: string };
  getLatestMatch: () => MatchSnapshot | undefined;
  getLastKnownBestOf: () => number;
  getSeatMap: () => { east: 'P1' | 'P2'; west: 'P1' | 'P2' } | null;
  showEnd: (reason: string, winner?: 'east' | 'west') => void;
  onMatchEnd?: (
    reason: string,
    winner?: 'east' | 'west',
    summary?: OnlineMatchSummary | null,
  ) => void;
  seatToSide: (seat: 'P1' | 'P2') => 'east' | 'west';
  getInitialSeat: () => 'P1' | 'P2';
  isMatchEnded: () => boolean;
  setMatchEnded: (ended: boolean) => void;
  disconnectNet: () => void;
  hideDisconnectOverlay: () => void;
};

export type MatchLifecycle = {
  finalizeMatch(
    reason: string,
    winner?: 'east' | 'west',
    summaryFromNet?: OnlineMatchSummary | null,
  ): void;
  ensureWaitingForOpponentTimeout(state: RoomStateMessage): void;
  startCountdown(untilEpochMs: number): void;
  stopCountdown(): void;
  clearWaitingForOpponentTimeout(): void;
  warnPoorConnectionIfNeeded(rttMs: number): void;
};

export function createMatchLifecycle(deps: MatchLifecycleDeps): MatchLifecycle {
  let waitingTimeout: number | null = null;
  let startCountdownTimer: number | null = null;

  const clearWaitingForOpponentTimeout = () => {
    if (waitingTimeout !== null) {
      window.clearTimeout(waitingTimeout);
      waitingTimeout = null;
    }
  };

  const stopCountdown = () => {
    if (startCountdownTimer !== null) {
      clearInterval(startCountdownTimer);
      startCountdownTimer = null;
    }
    deps.hud.flashMessage('', 0);
  };

  const startCountdown = (untilEpochMs: number) => {
    stopCountdown();
    const tick = () => {
      const remain = Math.max(0, untilEpochMs - Date.now());
      if (remain <= 0) {
        stopCountdown();
        return;
      }
      const secs = remain / 1000;
      const text =
        secs >= 10 ? `Match starts in ${Math.ceil(secs)}s` : `Match starts in ${secs.toFixed(1)}s`;
      deps.hud.flashMessage(text, 500);
    };
    tick();
    startCountdownTimer = window.setInterval(tick, 120);
  };

  const warnPoorConnectionIfNeeded = createLatencyWarning({
    hud: deps.hud,
    isMatchEnded: deps.isMatchEnded,
    isCountdownActive: () => startCountdownTimer !== null,
  });

  const finalizeMatch = (
    reason: string,
    winner?: 'east' | 'west',
    summaryFromNet: OnlineMatchSummary | null = null,
  ) => {
    if (deps.isMatchEnded()) return;
    deps.setMatchEnded(true);
    clearWaitingForOpponentTimeout();
    deps.hideDisconnectOverlay();

    const names = deps.getNames();
    const eastAlias = names.east;
    const westAlias = names.west;
    const latestMatch = deps.getLatestMatch();
    const lastKnownBestOf = deps.getLastKnownBestOf();
    const seatMap = deps.getSeatMap();

    const history = (latestMatch?.gamesHistory ?? []).map((game) => ({ ...game }));
    const defaultWinner = winner ?? history.at(-1)?.winner ?? 'east';
    const defaultBestOf = latestMatch?.bestOf ?? lastKnownBestOf;
    const mergedSummary: OnlineMatchSummary = summaryFromNet
      ? {
          ...summaryFromNet,
          winner: summaryFromNet.winner ?? defaultWinner,
          bestOf: summaryFromNet.bestOf ?? defaultBestOf,
          gamesHistory:
            summaryFromNet.gamesHistory && summaryFromNet.gamesHistory.length
              ? summaryFromNet.gamesHistory
              : history,
          names: {
            east: summaryFromNet.names?.east ?? eastAlias,
            west: summaryFromNet.names?.west ?? westAlias,
          },
          seats: summaryFromNet.seats ?? seatMap ?? undefined,
          mmr: summaryFromNet.mmr ?? {
            east: { before: 0, after: 0 },
            west: { before: 0, after: 0 },
          },
        }
      : {
          winner: defaultWinner,
          bestOf: defaultBestOf,
          gamesHistory: history,
          names: { east: eastAlias, west: westAlias },
          seats: seatMap ?? undefined,
          mmr: {
            east: { before: 0, after: 0 },
            west: { before: 0, after: 0 },
          },
        };

    const resolvedWinner = mergedSummary.winner;
    deps.showEnd(reason, resolvedWinner);
    deps.onMatchEnd?.(reason, resolvedWinner, mergedSummary);
  };

  const ensureWaitingForOpponentTimeout = (state: RoomStateMessage) => {
    if (deps.isMatchEnded() || waitingTimeout !== null) return;

    const baseDelay =
      typeof state.startAtEpochMs === 'number' ? state.startAtEpochMs - Date.now() : 0;
    const delay = Math.max(
      WAITING_MIN_TIMEOUT_MS,
      Math.min(WAITING_MAX_TIMEOUT_MS, baseDelay + WAITING_EXTRA_GRACE_MS),
    );

    const initialSeat = deps.getInitialSeat();
    const winnerSide = deps.seatToSide(initialSeat);

    waitingTimeout = window.setTimeout(() => {
      waitingTimeout = null;
      finalizeMatch('opponent_timeout', winnerSide, null);
      try {
        deps.disconnectNet();
      } catch {
        /* ignore */
      }
    }, delay);
  };

  return {
    finalizeMatch,
    ensureWaitingForOpponentTimeout,
    startCountdown,
    stopCountdown,
    clearWaitingForOpponentTimeout,
    warnPoorConnectionIfNeeded,
  };
}
