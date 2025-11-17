import type { GameState } from '@pong/game-logic';

export type FrameSample = {
  state: GameState;
  timestamp: number;
};

export type FrameBufferSyncResult = {
  snap: GameState | null;
  ref: GameState | null;
  hasPrev: boolean;
  prevT: number;
  currT: number;
};

export type FrameBuffer = {
  reset(): void;
  enqueue(state: GameState): void;
  sync(targetTime: number): FrameBufferSyncResult;
  setTickMs(ms: number): void;
  getTickMs(): number;
};

export const FRAME_BUFFER_LIMIT = 90;

export function createFrameBuffer(initialTickMs: number): FrameBuffer {
  const samples: FrameSample[] = [];
  let prevSnap: GameState | null = null;
  let latest: GameState | null = null;
  let prevT = 0;
  let currT = 0;
  let tickMs = initialTickMs;

  const reset = () => {
    samples.length = 0;
    prevSnap = null;
    latest = null;
    prevT = 0;
    currT = 0;
  };

  const enqueue = (state: GameState) => {
    const timestamp = performance.now();
    const sample: FrameSample = { state, timestamp };
    samples.push(sample);
    while (samples.length > FRAME_BUFFER_LIMIT) {
      samples.shift();
    }
    if (!prevSnap) {
      prevSnap = sample.state;
      latest = sample.state;
      prevT = sample.timestamp;
      currT = sample.timestamp + tickMs;
    }
  };

  const sync = (targetTime: number): FrameBufferSyncResult => {
    if (!samples.length) {
      const hasPrev = !!prevSnap && prevT < currT;
      return { snap: latest ?? prevSnap, ref: prevSnap, hasPrev, prevT, currT };
    }

    const newest = samples[samples.length - 1];
    if (!newest) {
      const hasPrev = !!prevSnap && prevT < currT;
      return { snap: latest ?? prevSnap, ref: prevSnap, hasPrev, prevT, currT };
    }

    if (targetTime >= newest.timestamp) {
      prevSnap = newest.state;
      latest = newest.state;
      prevT = newest.timestamp;
      currT = newest.timestamp + tickMs;
      if (samples.length > 1) {
        samples.splice(0, samples.length - 1);
      }
      const hasPrev = !!prevSnap && prevT < currT;
      return { snap: latest, ref: prevSnap, hasPrev, prevT, currT };
    }

    while (samples.length >= 2) {
      const maybeSecond = samples[1];
      if (!maybeSecond || maybeSecond.timestamp > targetTime) break;
      samples.shift();
    }

    const first = samples[0];
    if (!first) {
      const hasPrev = !!prevSnap && prevT < currT;
      return { snap: latest ?? prevSnap, ref: prevSnap, hasPrev, prevT, currT };
    }
    const second = samples[1] ?? first;
    prevSnap = first.state;
    latest = second.state;
    prevT = first.timestamp;
    currT = second === first ? first.timestamp + tickMs : second.timestamp;

    const hasPrev = !!prevSnap && prevT < currT;
    return { snap: latest, ref: prevSnap, hasPrev, prevT, currT };
  };

  const setTickMs = (ms: number) => {
    tickMs = Math.max(1, ms);
  };

  const getTickMs = () => tickMs;

  return {
    reset,
    enqueue,
    sync,
    setTickMs,
    getTickMs,
  };
}

