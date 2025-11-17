import type { InputIntent } from '@pong/shared';
import { ZeroIntent } from '@pong/shared';
import {
  attachKeyboard,
  readKeyboardAxes,
  setBindingProfile,
  setLocalSeatInputDisabled,
} from './keyboard';
import { overrideBindings } from './bindings';
import { attachTouchZones, readTouchAxes, setTouchSeatVisibility } from './touch-zones';
import { blockInputFor, isInputBlocked } from './block';
import { isMobile } from '../utils/platform';

export { blockInputFor, isInputBlocked };
export { setBindingProfile, overrideBindings };
export { setLocalSeatInputDisabled };
export { setTouchSeatVisibility };

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
  // Only attach touch controls on mobile devices; desktop uses keyboard only.
  const dt = isMobile() ? attachTouchZones(el) : () => {};
  return () => {
    dk();
    dt();
  };
}

/**
 * Seat-centric view of local axes for online mode.
 * Returns raw P1/P2 axes before any mirroring so the caller
 * can route them by seat identity (server does end-mapping).
 */
export function readSeatAxes(): { P1Axis: number; P2Axis: number } {
  if (isInputBlocked()) return { P1Axis: 0, P2Axis: 0 };

  const { leftAxisTouch, rightAxisTouch } = readTouchAxes();
  const { leftAxisKey, rightAxisKey } = readKeyboardAxes();

  const P1Axis = leftAxisTouch !== 0 ? leftAxisTouch : leftAxisKey;
  const P2Axis = rightAxisTouch !== 0 ? rightAxisTouch : rightAxisKey;

  return { P1Axis, P2Axis };
}

export function readIntent(): InputIntent {
  if (isInputBlocked()) return ZeroIntent;

  const { leftAxisTouch, rightAxisTouch } = readTouchAxes();
  const { leftAxisKey, rightAxisKey } = readKeyboardAxes();

  const leftAxis = leftAxisTouch !== 0 ? leftAxisTouch : leftAxisKey;
  const rightAxis = rightAxisTouch !== 0 ? rightAxisTouch : rightAxisKey;

  // When sides are swapped, swap which physical paddle each player controls.
  // leftAxis always drives EAST, rightAxis drives WEST (player seats P1/P2 remain stable).
  if (controlsMirrored) {
    INTENT.leftAxis = rightAxis; // drives EAST
    INTENT.rightAxis = leftAxis; // drives WEST
  } else {
    INTENT.leftAxis = leftAxis; // drives EAST
    INTENT.rightAxis = rightAxis; // drives WEST
  }
  return INTENT;
}
