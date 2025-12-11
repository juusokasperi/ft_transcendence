/**
 * Minimal abstraction over a time source.
 *
 * Used by MatchRunner, ReconnectManager, and GameServer so time can be
 * mocked in tests (e.g. fake timers) without touching global Date/performance.
 */
export interface Clock {
  /** Current wall-clock time in milliseconds since epoch. */
  now(): number;
}

/**
 * Scheduling abstraction used by MatchRunner and ReconnectManager.
 *
 * Instead of returning native Timer handles, the scheduler returns cancel
 * functions so callers do not depend on Node's timer types directly.
 */
export interface Scheduler {
  /**
   * Schedule a repeating callback.
   *
   * Returns a function that cancels the interval when invoked.
   */
  setInterval(fn: () => void, ms: number): () => void;
  /**
   * Schedule a one-shot callback.
   *
   * Returns a function that cancels the timeout when invoked.
   */
  setTimeout(fn: () => void, ms: number): () => void;
}

/**
 * System clock implementation using Date.now().
 *
 * We intentionally use Date.now() (wall-clock) instead of performance.now()
 * so timestamps line up with other services and persisted data (tokens,
 * database rows, logs). High-resolution monotonic timing is not required
 * for this server; TickEngine operates on fixed dt values instead.
 */
export function systemClock(): Clock {
  return {
    now: () => Date.now(),
  };
}

/**
 * Scheduler implementation backed by Node's timers.
 *
 * GameServer uses this in production; tests can provide a custom Scheduler
 * to control time deterministically.
 */
export function nodeScheduler(): Scheduler {
  return {
    setInterval(fn, ms) {
      const handle = setInterval(fn, ms);
      return () => clearInterval(handle);
    },
    setTimeout(fn, ms) {
      const handle = setTimeout(fn, ms);
      return () => clearTimeout(handle);
    },
  };
}
