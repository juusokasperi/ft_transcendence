type KeyCode = string; // KeyboardEvent.code

export type BindingProfile = 'local' | 'online';

type Action = 'P1Up' | 'P1Down' | 'P2Up' | 'P2Down' | 'SoloUp' | 'SoloDown';

export type KeyBindings = Partial<Record<Action, KeyCode[]>>;

const DEFAULT_LOCAL: KeyBindings = {
  P1Up: ['KeyW'],
  P1Down: ['KeyS'],
  P2Up: ['ArrowUp'],
  P2Down: ['ArrowDown'],
};

const DEFAULT_ONLINE: KeyBindings = {
  SoloUp: ['KeyW', 'ArrowUp'],
  SoloDown: ['KeyS', 'ArrowDown'],
};

let currentProfile: BindingProfile = 'local';
let currentBindings: KeyBindings = { ...DEFAULT_LOCAL };

export function setBindingProfile(p: BindingProfile) {
  currentProfile = p;
  currentBindings = p === 'online' ? { ...DEFAULT_ONLINE } : { ...DEFAULT_LOCAL };
}

export function overrideBindings(b: KeyBindings) {
  currentBindings = { ...currentBindings, ...b };
}

function anyPressed(keys: Set<string>, codes: KeyCode[] | undefined): boolean {
  if (!codes || codes.length === 0) return false;
  for (const c of codes) if (keys.has(c)) return true;
  return false;
}

/** Map currently pressed keys to axes per the active profile. */
export function axesFromKeys(keys: Set<string>): { leftAxisKey: number; rightAxisKey: number } {
  const clamp1 = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  if (currentProfile === 'online') {
    const up = anyPressed(keys, currentBindings.SoloUp) ? 1 : 0;
    const down = anyPressed(keys, currentBindings.SoloDown) ? -1 : 0;
    const axis = clamp1(up + down);
    return { leftAxisKey: axis, rightAxisKey: axis };
  }

  // local
  const left = (anyPressed(keys, currentBindings.P1Up) ? 1 : 0) +
    (anyPressed(keys, currentBindings.P1Down) ? -1 : 0);
  const right = (anyPressed(keys, currentBindings.P2Up) ? 1 : 0) +
    (anyPressed(keys, currentBindings.P2Down) ? -1 : 0);
  return { leftAxisKey: clamp1(left), rightAxisKey: clamp1(right) };
}

export function getActiveBindingProfile(): BindingProfile {
  return currentProfile;
}

