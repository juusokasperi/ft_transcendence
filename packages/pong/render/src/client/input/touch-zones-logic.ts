export type Seat = 'P1' | 'P2';

export type TouchSeatVisibility = {
  P1: boolean;
  P2: boolean;
};

// Global visibility config so hosts (local/AI/online) can control which
// seat columns are shown. Defaults to both visible (local 2P).
let seatVisibility: TouchSeatVisibility = { P1: true, P2: true };

type VisibilityListener = (vis: TouchSeatVisibility) => void;
const visibilityListeners = new Set<VisibilityListener>();

export function getTouchSeatVisibility(): TouchSeatVisibility {
  return seatVisibility;
}

export function setTouchSeatVisibility(next: TouchSeatVisibility): void {
  seatVisibility = {
    P1: !!next.P1,
    P2: !!next.P2,
  };
  for (const fn of visibilityListeners) {
    try {
      fn(seatVisibility);
    } catch {
      // Best effort; individual listeners must be resilient.
    }
  }
}

export function addTouchSeatVisibilityListener(fn: VisibilityListener): () => void {
  visibilityListeners.add(fn);
  return () => {
    visibilityListeners.delete(fn);
  };
}

// Seat-centric touch axes (P1/P2). These are mapped to physical paddles
// via the controlsMirrored flag in aggregate.ts.
let axisP1 = 0; // -1..1
let axisP2 = 0; // -1..1

export function setSeatAxis(seat: Seat, axis: number): void {
  if (seat === 'P1') axisP1 = axis;
  else axisP2 = axis;
}

export function resetSeatAxis(seat: Seat): void {
  setSeatAxis(seat, 0);
}

export function resetAllSeatAxes(): void {
  axisP1 = 0;
  axisP2 = 0;
}

const clampAxis = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function readTouchAxes(): {
  leftAxisTouch: number;
  rightAxisTouch: number;
} {
  return {
    leftAxisTouch: clampAxis(axisP1),
    rightAxisTouch: clampAxis(axisP2),
  };
}

