export const BASE_PLAYBACK_DELAY_MS = 45;
const MIN_PLAYBACK_DELAY_MS = 40;
const MAX_PLAYBACK_DELAY_MS = 200;
export const PLAYBACK_EASING = 0.1;

const POOR_CONNECTION_LATENCY_MS = 150;
const POOR_CONNECTION_JITTER_MS = 90;
const POOR_CONNECTION_COOLDOWN_MS = 4000;
const POOR_CONNECTION_MESSAGE_MS = 2600;

type HudWithFlash = {
  flashMessage(message: string, durationMs: number): void;
};

export type PingIndicatorHandle = {
  set(latencyMs: number | null): void;
  detach(): void;
};

export function clampPlaybackDelay(value: number): number {
  return Math.max(MIN_PLAYBACK_DELAY_MS, Math.min(MAX_PLAYBACK_DELAY_MS, value));
}

export function computeDesiredPlaybackDelay(latencyMs: number): number {
  return clampPlaybackDelay(BASE_PLAYBACK_DELAY_MS + latencyMs * 0.5);
}

export function createLatencyWarning(options: {
  hud: HudWithFlash;
  isMatchEnded(): boolean;
  isCountdownActive(): boolean;
}): (latencyMs: number) => void {
  let lastLatencyMs = 0;
  let lastPoorWarningAt = 0;

  return (latencyMs: number) => {
    const jitter = Math.abs(latencyMs - lastLatencyMs);
    lastLatencyMs = latencyMs;
    if (latencyMs < POOR_CONNECTION_LATENCY_MS && jitter < POOR_CONNECTION_JITTER_MS) {
      return;
    }
    const now = Date.now();
    if (now - lastPoorWarningAt < POOR_CONNECTION_COOLDOWN_MS) return;
    if (options.isMatchEnded()) return;
    if (options.isCountdownActive()) return;
    lastPoorWarningAt = now;
    const rounded = Math.max(0, Math.round(latencyMs));
    const message = rounded > 0 ? `Connection unstable (${rounded}ms)` : 'Connection unstable';
    options.hud.flashMessage(message, POOR_CONNECTION_MESSAGE_MS);
  };
}

export function createPingIndicator(
  overlaySelector = '#pong-hud-root .pong-hud-overlay',
): PingIndicatorHandle {
  const pingIndicator = document.createElement('div');
  pingIndicator.className = 'pong-hud-ping';
  pingIndicator.style.display = 'none';

  const attach = () => {
    const overlay = document.querySelector(overlaySelector);
    if (overlay && pingIndicator.parentElement !== overlay) {
      overlay.appendChild(pingIndicator);
    }
  };

  return {
    set(latencyMs: number | null) {
      attach();
      if (latencyMs == null) {
        pingIndicator.style.display = 'none';
        return;
      }
      pingIndicator.style.display = 'block';
      const rounded = Math.max(0, Math.round(latencyMs));
      pingIndicator.textContent = `Ping ${rounded} ms`;
      pingIndicator.dataset.level = latencyMs >= 200 ? 'bad' : latencyMs >= 120 ? 'warn' : 'good';
    },
    detach() {
      pingIndicator.remove();
    },
  };
}
