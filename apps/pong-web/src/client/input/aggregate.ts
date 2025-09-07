// src/client/input/aggregate.ts
import type { InputIntent } from "@shared/protocol/input";
import { ZeroIntent } from "@shared/protocol/input";
import { attachKeyboard, readKeyboardAxes } from "./keyboard";
import { attachTouchZones, readTouchAxes } from "./touch-zones";
import { blockInputFor, isInputBlocked } from "./block";

export { blockInputFor, isInputBlocked };

export type Detach = () => void;

const INTENT: InputIntent = { leftAxis: 0, rightAxis: 0 };

let controlsMirrored = false;
export function setControlsMirrored(v: boolean) {
  controlsMirrored = v;
}
export function toggleControlsMirrored() {
  controlsMirrored = !controlsMirrored;
}

/** Public entry: attach both keyboard + touch. */
export function attachLocalInput(el: HTMLElement): Detach {
  const dk = attachKeyboard(el);
  const dt = attachTouchZones(el);
  return () => {
    dk();
    dt();
  };
}

export function readIntent(): InputIntent {
  if (isInputBlocked()) return ZeroIntent;

  const { leftAxisTouch, rightAxisTouch } = readTouchAxes();
  const { leftAxisKey, rightAxisKey } = readKeyboardAxes();

  const leftAxis = leftAxisTouch !== 0 ? leftAxisTouch : leftAxisKey;
  const rightAxis = rightAxisTouch !== 0 ? rightAxisTouch : rightAxisKey;

  // When sides are swapped, swap which paddle each player controls (P1/P2 stable).
  if (controlsMirrored) {
    INTENT.leftAxis = rightAxis; // drives P1
    INTENT.rightAxis = leftAxis; // drives P2
  } else {
    INTENT.leftAxis = leftAxis; // drives P1
    INTENT.rightAxis = rightAxis; // drives P2
  }
  return INTENT;
}
