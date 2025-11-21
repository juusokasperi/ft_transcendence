export type ResumeSnapshot = { token: string; expSec: number } | null;

type Deps = {
  resolvedUrl: string;
  getLatestResume: () => ResumeSnapshot;
  getWs: () => WebSocket;
  setWs: (ws: WebSocket) => void;
  attachHandlers: (socket: WebSocket) => void;
  detachHandlers: (socket: WebSocket) => void;
  onResumeOpen?: (next: WebSocket) => void;
};

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[OnlineGame]', ...args);
  }
};

export function createReconnector({
  resolvedUrl,
  getLatestResume,
  getWs,
  setWs,
  attachHandlers,
  detachHandlers,
  onResumeOpen,
}: Deps) {
  let reconnectTimer: number | null = null;
  let stopped = false;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const attemptReconnect = (prevDelayMs: number) => {
    clearReconnectTimer();
    if (stopped) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const resume = getLatestResume();
    if (!resume || resume.expSec <= nowSec) {
      //console.warn('[OnlineGame] No valid resume token available; aborting reconnect');
      return;
    }
    const delay = Math.min(Math.max(500, prevDelayMs * 2 || 500), 4000);
    const remainingMs = Math.max(0, (resume.expSec - nowSec) * 1000);
    if (delay > remainingMs) {
      //console.warn('[OnlineGame] Resume token nearly expired; aborting reconnect');
      return;
    }
    reconnectTimer = window.setTimeout(() => {
      try {
        debugLog('[OnlineGame] Attempting resume reconnect');
        const next = new WebSocket(resolvedUrl, ['resume', resume.token]);
        next.addEventListener('open', () => {
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
        next.addEventListener('close', () => {
          // Try again with backoff while token valid
          attemptReconnect(delay);
        });
      } catch {
        attemptReconnect(delay);
      }
    }, delay);
  };

  const onCloseAfterOpen = function (this: WebSocket, evt: CloseEvent) {
    // 4403 indicates expected replace during resume; ignore.
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
