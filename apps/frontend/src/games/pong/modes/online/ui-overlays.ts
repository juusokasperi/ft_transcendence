import type { PlayerSeat } from '@pong/render';

export function createDisconnectOverlayManager(canvas: HTMLCanvasElement) {
  let overlayContainer: HTMLDivElement | null = null;
  let overlayContent: HTMLDivElement | null = null;
  let interval: number | null = null;

  const syncOverlay = () => {
    if (!overlayContainer || !overlayContent) return;
    const rect = canvas.getBoundingClientRect();
    overlayContainer.style.left = rect.left + 'px';
    overlayContainer.style.top = rect.top + 'px';
    overlayContainer.style.width = rect.width + 'px';
    overlayContainer.style.height = rect.height + 'px';

    const baselineHeight = 420;
    const scale = rect.height < baselineHeight ? rect.height / baselineHeight : 1;
    overlayContent.style.transformOrigin = 'center center';
    overlayContent.style.transform = `scale(${scale})`;
  };

  const attachOverlay = () => {
    if (overlayContainer && overlayContent) return;

    overlayContainer = document.createElement('div');
    overlayContainer.style.cssText = `
      position: fixed;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 1100;
    `;

    overlayContent = document.createElement('div');
    overlayContent.style.cssText = `
      background: rgba(0, 0, 0, 0.9);
      color: #fbbf24;
      padding: 2rem;
      border-radius: 0.5rem;
      border: 2px solid #fbbf24;
      font-size: 1.25rem;
      font-weight: bold;
      text-align: center;
      max-width: 90%;
    `;

    overlayContainer.appendChild(overlayContent);
    document.body.appendChild(overlayContainer);

    window.addEventListener('resize', syncOverlay, { passive: true });
    window.addEventListener('scroll', syncOverlay, { passive: true });
    syncOverlay();
  };

  const detachOverlay = () => {
    window.removeEventListener('resize', syncOverlay);
    window.removeEventListener('scroll', syncOverlay);
    if (overlayContainer) {
      try {
        overlayContainer.remove();
      } catch {
        // ignore
      }
    }
    overlayContainer = null;
    overlayContent = null;
  };

  const showDisconnectOverlay = (gracePeriodMs: number) => {
    attachOverlay();
    if (!overlayContent) return;

    const endTime = Date.now() + gracePeriodMs;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      if (overlayContent)
        overlayContent.textContent = `Opponent disconnected. Waiting ${remaining}s before auto-win...`;
      if (remaining <= 0 && interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    updateCountdown();
    if (interval) clearInterval(interval);
    interval = window.setInterval(updateCountdown, 1000);
  };

  const hideDisconnectOverlay = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    detachOverlay();
  };

  return { showDisconnectOverlay, hideDisconnectOverlay } as const;
}

export function showMatchEndOverlay(
  canvas: HTMLCanvasElement,
  reason: string,
  winner: 'east' | 'west' | undefined,
  mySeat: PlayerSeat,
) {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 1100;
  `;

  const el = document.createElement('div');
  el.style.cssText = `
    background: rgba(0, 0, 0, 0.95);
    color: #fff;
    padding: 2rem;
    border-radius: 0.5rem;
    border: 2px solid #10b981;
    font-size: 1.5rem;
    font-weight: bold;
    text-align: center;
    max-width: 90%;
  `;

  const endAt = Date.now() + 5000;

  const computeMessage = (remaining: number): string => {
    // Default
    let msg = 'Match ended';
    if (reason === 'opponent_timeout') {
      if (winner) {
        const youWon =
          (mySeat === 'P1' && winner === 'east') || (mySeat === 'P2' && winner === 'west');
        msg = youWon
          ? `You won! Opponent disconnected. Showing results in ${remaining}s…`
          : `You lost (Disconnected). Showing results in ${remaining}s…`;
        el.style.borderColor = youWon ? '#10b981' : '#ef4444';
        el.style.color = youWon ? '#10b981' : '#ef4444';
      } else {
        msg = `Opponent disconnected - Match ended. Showing results in ${remaining}s…`;
        el.style.borderColor = '#f59e0b';
        el.style.color = '#f59e0b';
      }
    } else if (reason === 'forfeit') {
      if (winner) {
        const youWon =
          (mySeat === 'P1' && winner === 'east') || (mySeat === 'P2' && winner === 'west');
        msg = youWon
          ? `Opponent forfeited. You win! Showing results in ${remaining}s…`
          : `You forfeited. Showing results in ${remaining}s…`;
        el.style.borderColor = youWon ? '#10b981' : '#ef4444';
        el.style.color = youWon ? '#10b981' : '#ef4444';
      } else {
        msg = `Opponent forfeited. Showing results in ${remaining}s…`;
        el.style.borderColor = '#f59e0b';
        el.style.color = '#f59e0b';
      }
    }
    return msg;
  };

  const update = () => {
    const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    el.textContent = computeMessage(remaining);
  };

  update();
  container.appendChild(el);
  document.body.appendChild(container);

  const syncOverlay = () => {
    const rect = canvas.getBoundingClientRect();
    container.style.left = rect.left + 'px';
    container.style.top = rect.top + 'px';
    container.style.width = rect.width + 'px';
    container.style.height = rect.height + 'px';

    const baselineHeight = 420;
    const scale = rect.height < baselineHeight ? rect.height / baselineHeight : 1;
    el.style.transformOrigin = 'center center';
    el.style.transform = `scale(${scale})`;
  };

  syncOverlay();
  window.addEventListener('resize', syncOverlay, { passive: true });
  window.addEventListener('scroll', syncOverlay, { passive: true });

  const interval = window.setInterval(update, 250);
  const timeout = window.setTimeout(() => {
    try {
      window.clearInterval(interval);
      window.removeEventListener('resize', syncOverlay);
      window.removeEventListener('scroll', syncOverlay);
      container.remove();
    } catch {}
  }, 5000);
  return () => {
    clearTimeout(timeout);
    clearInterval(interval);
    try {
      window.removeEventListener('resize', syncOverlay);
      window.removeEventListener('scroll', syncOverlay);
      container.remove();
    } catch {}
  };
}
