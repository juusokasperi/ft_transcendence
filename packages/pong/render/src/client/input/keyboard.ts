import { axesFromKeys, setBindingProfile } from './bindings';

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
  const clearKeys = () => {
    keys.clear();
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
    keys.clear();
  };
}

/** Returns axis intent from current key set. (+1 up, -1 down) */
export function readKeyboardAxes(): {
  leftAxisKey: number;
  rightAxisKey: number;
} {
  return axesFromKeys(keys);
}

// Re-export for convenience so higher layers can switch profiles without
// reaching into bindings.ts directly.
export { setBindingProfile };
