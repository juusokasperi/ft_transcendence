export interface Clock {
  now(): number;
}

export interface Scheduler {
  setInterval(fn: () => void, ms: number): () => void;
  setTimeout(fn: () => void, ms: number): () => void;
}

export function systemClock(): Clock {
  return {
    now: () => Date.now(),
  };
}

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
