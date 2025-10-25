import type { PlayerSeat } from '@pong/render';

export function createDisconnectOverlayManager(canvas: HTMLCanvasElement) {
  let overlay: HTMLDivElement | null = null;
  let interval: number | null = null;

  const showDisconnectOverlay = (gracePeriodMs: number) => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: #fbbf24;
        padding: 2rem;
        border-radius: 0.5rem;
        border: 2px solid #fbbf24;
        font-size: 1.25rem;
        font-weight: bold;
        text-align: center;
        z-index: 1000;
        pointer-events: none;
      `;
      canvas.parentElement?.appendChild(overlay);
    }

    const endTime = Date.now() + gracePeriodMs;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      if (overlay)
        overlay.textContent = `Opponent disconnected. Waiting ${remaining}s before auto-win...`;
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
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  };

  return { showDisconnectOverlay, hideDisconnectOverlay } as const;
}

export function showMatchEndOverlay(
  canvas: HTMLCanvasElement,
  reason: string,
  winner: 'east' | 'west' | undefined,
  mySeat: PlayerSeat,
) {
  const el = document.createElement('div');
  el.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.95);
    color: #fff;
    padding: 2rem;
    border-radius: 0.5rem;
    border: 2px solid #10b981;
    font-size: 1.5rem;
    font-weight: bold;
    text-align: center;
    z-index: 1000;
    pointer-events: none;
  `;

  let message = 'Match ended';
  if (reason === 'opponent_timeout') {
    if (winner) {
      const youWon =
        (mySeat === 'P1' && winner === 'east') || (mySeat === 'P2' && winner === 'west');
      message = youWon ? 'You won! (Opponent disconnected)' : 'You lost (Disconnected)';
      el.style.borderColor = youWon ? '#10b981' : '#ef4444';
      el.style.color = youWon ? '#10b981' : '#ef4444';
    } else {
      message = 'Opponent disconnected - Match ended';
      el.style.borderColor = '#f59e0b';
      el.style.color = '#f59e0b';
    }
  }
  el.textContent = message;
  canvas.parentElement?.appendChild(el);
  const t = window.setTimeout(() => el.remove(), 5000);
  return () => {
    clearTimeout(t);
    try {
      el.remove();
    } catch {}
  };
}
