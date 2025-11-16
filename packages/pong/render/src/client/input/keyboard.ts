import { axesFromKeys, setBindingProfile } from './bindings';

// Track separate key sets for real user input vs synthetic (AI) events.
const trustedKeys = new Set<string>();
const syntheticKeys = new Set<string>();

// When set, ignore trusted keyboard input for the chosen local seat (P1→left, P2→right).
let disabledLocalSeat: 'P1' | 'P2' | null = null;
export function setLocalSeatInputDisabled(seat: 'P1' | 'P2' | null) {
  disabledLocalSeat = seat;
}

type KeyboardDetach = () => void;

/** Attach key listeners to any focusable host element (e.g., canvas). */
export function attachKeyboard(el: HTMLElement): KeyboardDetach {
  const dn = (e: KeyboardEvent) => {
    // Use physical key location to be layout-agnostic (WASD vs ZQSD, etc.)
    // Separate trusted (user) vs untrusted (programmatic) events so we can
    // selectively ignore user control for AI-driven seats while still
    // accepting synthetic key events from the bot.
    if (e.isTrusted) {
      trustedKeys.add(e.code);
    } else {
      syntheticKeys.add(e.code);
    }
    // Prevent page scroll when the canvas has focus and arrows are used
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
  };
  const up = (e: KeyboardEvent) => {
    if (e.isTrusted) {
      trustedKeys.delete(e.code);
    } else {
      syntheticKeys.delete(e.code);
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
  };
  const clearKeys = () => {
    trustedKeys.clear();
    syntheticKeys.clear();
  };

  el.addEventListener('keydown', dn);
  el.addEventListener('keyup', up);
  el.addEventListener('blur', clearKeys);
  window.addEventListener('blur', clearKeys);
  return () => {
    el.removeEventListener('keydown', dn);
    el.removeEventListener('keyup', up);
    el.removeEventListener('blur', clearKeys);
    window.removeEventListener('blur', clearKeys);
    trustedKeys.clear();
    syntheticKeys.clear();
  };
}

/** Returns axis intent from current key set. (+1 up, -1 down) */
export function readKeyboardAxes(): {
  leftAxisKey: number;
  rightAxisKey: number;
} {
  const fromTrusted = axesFromKeys(trustedKeys);
  const fromSynthetic = axesFromKeys(syntheticKeys);

  // If a seat is disabled for local control, zero out the trusted portion for that seat.
  if (disabledLocalSeat === 'P1') {
    fromTrusted.leftAxisKey = 0;
  } else if (disabledLocalSeat === 'P2') {
    fromTrusted.rightAxisKey = 0;
  }

  // Prefer synthetic (AI) axis when present; otherwise fall back to trusted.
  const leftAxisKey =
    fromSynthetic.leftAxisKey !== 0 ? fromSynthetic.leftAxisKey : fromTrusted.leftAxisKey;
  const rightAxisKey =
    fromSynthetic.rightAxisKey !== 0 ? fromSynthetic.rightAxisKey : fromTrusted.rightAxisKey;

  return { leftAxisKey, rightAxisKey };
}

// Re-export for convenience so higher layers can switch profiles without
// reaching into bindings.ts directly.
export { setBindingProfile };
