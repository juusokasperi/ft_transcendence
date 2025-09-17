const keys = new Set<string>();

type KeyboardDetach = () => void;

/** Attach key listeners to any focusable host element (e.g., canvas). */
export function attachKeyboard(el: HTMLElement): KeyboardDetach {
  const dn = (e: KeyboardEvent) => {
    // Use physical key location to be layout-agnostic (WASD vs ZQSD, etc.)
    keys.add(e.code);
    // Prevent page scroll when the canvas has focus and arrows are used
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.code);
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
  };
  el.addEventListener('keydown', dn);
  el.addEventListener('keyup', up);
  return () => {
    el.removeEventListener('keydown', dn);
    el.removeEventListener('keyup', up);
    keys.clear();
  };
}

/** Returns axis intent from current key set. (+1 up, -1 down) */
export function readKeyboardAxes(): {
  leftAxisKey: number;
  rightAxisKey: number;
} {
  const clamp1 = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  // Use KeyW/KeyS so the same physical keys work on QWERTY, AZERTY, etc.
  const leftKey = (keys.has('KeyW') ? 1 : 0) + (keys.has('KeyS') ? -1 : 0);

  const rightKey = (keys.has('ArrowUp') ? 1 : 0) + (keys.has('ArrowDown') ? -1 : 0);

  return {
    leftAxisKey: clamp1(leftKey),
    rightAxisKey: clamp1(rightKey),
  };
}
