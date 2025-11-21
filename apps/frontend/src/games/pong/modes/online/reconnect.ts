export type ResumeSnapshot = { token: string; expSec: number } | null;

type Deps = {
  isPermanentClose: (code: number) => boolean;
  resolvedUrl: string;
  getLatestResume: () => ResumeSnapshot;
  getWs: () => WebSocket;
  setWs: (ws: WebSocket) => void;
  attachHandlers: (socket: WebSocket) => void;
  detachHandlers: (socket: WebSocket) => void;
  onPermanentClose: () => void;
  onResumeAccepted?: () => void;
  onResumeOpen?: (next: WebSocket) => void;
  onResumeGiveUp?: (reason: 'missing-token' | 'rejected' | 'expired') => void;
};

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[OnlineGame]', ...args);
  }
};

export function createReconnector({
  resolvedUrl,
  isPermanentClose,
  getLatestResume,
  getWs,
  setWs,
  attachHandlers,
  detachHandlers,
  onResumeOpen,
  onPermanentClose,
  onResumeAccepted,
  onResumeGiveUp,
}: Deps) {
  let reconnectTimer: number | null = null;
  let stopped = false;
  let preOpenFailures = 0;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const giveUp = (reason: 'missing-token' | 'rejected' | 'expired') => {
    stopped = true;
    clearReconnectTimer();
    try {
      onResumeGiveUp?.(reason);
    } catch {}
  };

  const attemptReconnect = (prevDelayMs: number) => {
    clearReconnectTimer();
    if (stopped) return;
    const isPolicyClose = (code: number) => code >= 4400 && code < 4500;
    const nowSec = Math.floor(Date.now() / 1000);
    const resume = getLatestResume();
    if (!resume || resume.expSec <= nowSec) {
      giveUp(!resume ? 'missing-token' : 'expired');
      return;
    }
    const delay = Math.min(Math.max(500, prevDelayMs * 2 || 500), 4000);
    const remainingMs = Math.max(0, (resume.expSec - nowSec) * 1000);
    if (delay > remainingMs) {
      giveUp('expired');
      return;
    }
    reconnectTimer = window.setTimeout(() => {
      try {
        debugLog('[OnlineGame] Attempting resume reconnect');
        const next = new WebSocket(resolvedUrl, ['resume', resume.token]);
        let opened = false;
        next.addEventListener('open', () => {
          opened = true;
          preOpenFailures = 0;
          try {
            onResumeAccepted?.();
          } catch {}
          debugLog('[OnlineGame] Resume reconnect successful');
          // Swap sockets and handlers
          const old = getWs();
          detachHandlers(old);
          // Ensure the previous socket is closed to avoid lingering connections
          try {
            old.close(1000, 'replaced');
          } catch {}
          setWs(next);
          attachHandlers(next);
          clearReconnectTimer();
          try {
            onResumeOpen?.(next);
          } catch {}
        });
        next.addEventListener('close', (evt) => {
          if (!opened) preOpenFailures += 1;
          const policyClose = isPolicyClose(evt.code);
          if (policyClose || preOpenFailures >= 3) {
            giveUp('rejected');
            return;
          }
          // Try again with backoff while token valid
          attemptReconnect(delay);
        });
        next.addEventListener('error', () => {
          /* handled by close event */
        });
      } catch {
        attemptReconnect(delay);
      }
    }, delay);
  };

  const onCloseAfterOpen = function (this: WebSocket, evt: CloseEvent) {
    // 4403 indicates expected replace during resume; ignore.
    if (isPermanentClose(evt.code)) {
      stop();
      onPermanentClose();
      return;
    }
    if (evt.code === 4403) return;
    // Begin reconnect attempts if a resume token exists.
    if (getLatestResume()) {
      attemptReconnect(0);
    }
  };

  const stop = () => {
    stopped = true;
    clearReconnectTimer();
  };

  return { onCloseAfterOpen, stop, clearReconnectTimer } as const;
}
