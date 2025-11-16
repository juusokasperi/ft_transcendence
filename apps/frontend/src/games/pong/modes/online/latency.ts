export const BASE_PLAYBACK_DELAY_MS = 45;
const MIN_PLAYBACK_DELAY_MS = 40;
const MAX_PLAYBACK_DELAY_MS = 200;
export const PLAYBACK_EASING = 0.1;

const POOR_CONNECTION_LATENCY_MS = 150;
const POOR_CONNECTION_JITTER_MS = 90;
const POOR_CONNECTION_COOLDOWN_MS = 4000;
const POOR_CONNECTION_MESSAGE_MS = 2600;
const PING_WARN_THRESHOLD_MS = 120;
const PING_BAD_THRESHOLD_MS = 200;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

type HudWithFlash = {
  flashMessage(message: string, durationMs: number): void;
};

export type PingIndicatorHandle = {
  set(latencyMs: number | null): void;
  detach(): void;
};

export type PingHotkeyController = {
  update(latencyMs: number | null): void;
  dispose(): void;
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
    const now = nowMs();
    if (now - lastPoorWarningAt < POOR_CONNECTION_COOLDOWN_MS) return;
    if (options.isMatchEnded()) return;
    if (options.isCountdownActive()) return;
    lastPoorWarningAt = now;
    options.hud.flashMessage('Connection unstable', POOR_CONNECTION_MESSAGE_MS);
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
      pingIndicator.dataset.level = getPingLevel(latencyMs);
    },
    detach() {
      pingIndicator.remove();
    },
  };
}

type PingLevel = 'good' | 'warn' | 'bad';

const getPingLevel = (latencyMs: number): PingLevel => {
  if (latencyMs >= PING_BAD_THRESHOLD_MS) return 'bad';
  if (latencyMs >= PING_WARN_THRESHOLD_MS) return 'warn';
  return 'good';
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export function bindPingHotkey(indicator: PingIndicatorHandle, key = 'p'): PingHotkeyController {
  const normalizedKey = key.toLowerCase();
  let latest: number | null = null;
  let active = false;
  let forcedVisible = false;

  const refresh = () => {
    indicator.set(forcedVisible || active ? latest : null);
  };

  const matchesKey = (eventKey: string) => eventKey.toLowerCase() === normalizedKey;

  const handleKeyDown = (ev: KeyboardEvent) => {
    if (!matchesKey(ev.key)) return;
    if (isTypingTarget(ev.target)) return;
    if (ev.repeat) return;
    active = !active;
    refresh();
  };

  window.addEventListener('keydown', handleKeyDown);
  refresh();

  return {
    update(latencyMs: number | null) {
      latest = latencyMs;
      forcedVisible = typeof latencyMs === 'number' && getPingLevel(latencyMs) !== 'good';
      refresh();
    },
    dispose() {
      window.removeEventListener('keydown', handleKeyDown);
      active = false;
      latest = null;
      forcedVisible = false;
      indicator.set(null);
    },
  };
}
