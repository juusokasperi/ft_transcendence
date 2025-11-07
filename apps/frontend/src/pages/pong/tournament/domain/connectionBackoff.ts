export const DEFAULT_RECONNECT_DELAY = 1500;
export const MAX_RECONNECT_DELAY = 10_000;
export const MIN_COOLDOWN_MS = 300;

export function nextBackoffDelay(previousDelay: number): number {
  const next = Math.floor(previousDelay * 1.8);
  return Math.min(next, MAX_RECONNECT_DELAY);
}

/**
 * Ensure a minimum cool-down after a disconnect before attempting a reconnect.
 * Returns the effective delay to use given a requested delay and last disconnect time.
 */
export function computeDelayWithCooldown(
  lastDisconnectAt: number | null,
  requestedDelay: number,
  now: number,
  minCooldownMs: number = MIN_COOLDOWN_MS,
): number {
  let delay = requestedDelay;
  if (lastDisconnectAt !== null) {
    const elapsed = now - lastDisconnectAt;
    if (elapsed < minCooldownMs) {
      delay = Math.max(delay, minCooldownMs - elapsed);
    }
  }
  return delay;
}
