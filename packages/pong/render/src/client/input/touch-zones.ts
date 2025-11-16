export type TouchSeatVisibility = {
  P1: boolean;
  P2: boolean;
};

// Global visibility config so hosts (local/AI/online) can control which
// seat columns are shown. Defaults to both visible (local 2P).
let seatVisibility: TouchSeatVisibility = { P1: true, P2: true };

type VisibilityListener = (vis: TouchSeatVisibility) => void;
const visibilityListeners = new Set<VisibilityListener>();

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

// Seat-centric touch axes (P1/P2). These are mapped to physical paddles
// via the controlsMirrored flag in aggregate.ts.
let axisP1 = 0; // -1..1
let axisP2 = 0; // -1..1

const clampAxis = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

export type TouchDetach = () => void;

type Seat = 'P1' | 'P2';
type Direction = 'up' | 'down';

type ActivePointer = {
  seat: Seat;
  dir: Direction;
};

/** Attach seat-based button controls to an element (mobile-only via caller). */
export function attachTouchZones(el: HTMLElement): TouchDetach {
  if (typeof document === 'undefined') {
    return () => {
      axisP1 = 0;
      axisP2 = 0;
    };
  }

  const activePointers = new Map<number, ActivePointer>();

  const host = el.closest('.pong-game-root') ?? document.body;

  const root = document.createElement('div');
  root.className = 'pong-touch-root';

  const overlay = document.createElement('div');
  overlay.className = 'pong-touch-overlay';
  root.appendChild(overlay);

  const controls = document.createElement('div');
  controls.className = 'pong-touch-controls';
  overlay.appendChild(controls);

  const makeColumn = (seat: Seat, align: 'left' | 'right') => {
    const col = document.createElement('div');
    col.className = `pong-touch-col pong-touch-col-${align}`;

    const btnUp = document.createElement('button');
    btnUp.type = 'button';
    btnUp.className = 'pong-touch-btn pong-touch-btn-up';
    btnUp.textContent = '▲';
    btnUp.setAttribute('aria-label', `${seat} move up`);

    const btnDown = document.createElement('button');
    btnDown.type = 'button';
    btnDown.className = 'pong-touch-btn pong-touch-btn-down';
    btnDown.textContent = '▼';
    btnDown.setAttribute('aria-label', `${seat} move down`);

    col.appendChild(btnUp);
    col.appendChild(btnDown);

    return { col, btnUp, btnDown };
  };

  const colP1 = makeColumn('P1', 'left');
  const colP2 = makeColumn('P2', 'right');
  controls.appendChild(colP1.col);
  controls.appendChild(colP2.col);

  const updateSeatAxis = (seat: Seat) => {
    let up = 0;
    let down = 0;
    for (const info of activePointers.values()) {
      if (info.seat !== seat) continue;
      if (info.dir === 'up') up++;
      else if (info.dir === 'down') down++;
    }
    const axis = up > 0 && down === 0 ? 1 : down > 0 && up === 0 ? -1 : 0;
    if (seat === 'P1') axisP1 = axis;
    else axisP2 = axis;
  };

  const handlePointerDown = (seat: Seat, dir: Direction, ev: PointerEvent) => {
    if (ev.pointerType && ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return;
    activePointers.set(ev.pointerId, { seat, dir });
    updateSeatAxis(seat);
    ev.preventDefault();
  };

  const handlePointerEnd = (ev: PointerEvent) => {
    const entry = activePointers.get(ev.pointerId);
    if (!entry) return;
    activePointers.delete(ev.pointerId);
    updateSeatAxis(entry.seat);
    ev.preventDefault();
  };

  const bindButton = (seat: Seat, dir: Direction, btn: HTMLButtonElement) => {
    const down = (ev: PointerEvent) => handlePointerDown(seat, dir, ev);
    const up = (ev: PointerEvent) => handlePointerEnd(ev);
    const leave = (ev: PointerEvent) => handlePointerEnd(ev);
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', leave);
    return () => {
      btn.removeEventListener('pointerdown', down);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      btn.removeEventListener('pointerleave', leave);
    };
  };

  const unbindP1Up = bindButton('P1', 'up', colP1.btnUp);
  const unbindP1Down = bindButton('P1', 'down', colP1.btnDown);
  const unbindP2Up = bindButton('P2', 'up', colP2.btnUp);
  const unbindP2Down = bindButton('P2', 'down', colP2.btnDown);

  const applyVisibility = (vis: TouchSeatVisibility) => {
    const p1Visible = !!vis.P1;
    const p2Visible = !!vis.P2;
    colP1.col.style.display = p1Visible ? '' : 'none';
    colP2.col.style.display = p2Visible ? '' : 'none';

    if (!p1Visible) {
      axisP1 = 0;
      for (const [id, info] of activePointers) {
        if (info.seat === 'P1') activePointers.delete(id);
      }
    }
    if (!p2Visible) {
      axisP2 = 0;
      for (const [id, info] of activePointers) {
        if (info.seat === 'P2') activePointers.delete(id);
      }
    }
  };

  applyVisibility(seatVisibility);
  visibilityListeners.add(applyVisibility);

  host.appendChild(root);

  let boundEl: HTMLElement | null = el;
  let ro: ResizeObserver | null = null;
  let rafId: number | null = null;

  const syncOverlay = () => {
    if (!boundEl) return;
    const rect = boundEl.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  };

  const scheduleSync = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      syncOverlay();
    });
  };

  syncOverlay();
  ro = new ResizeObserver(() => scheduleSync());
  ro.observe(el);
  window.addEventListener('resize', scheduleSync);
  window.addEventListener('scroll', scheduleSync, { passive: true });

  return () => {
    visibilityListeners.delete(applyVisibility);

    unbindP1Up();
    unbindP1Down();
    unbindP2Up();
    unbindP2Down();

    activePointers.clear();
    axisP1 = 0;
    axisP2 = 0;

    if (ro) {
      ro.disconnect();
      ro = null;
    }
    window.removeEventListener('resize', scheduleSync);
    window.removeEventListener('scroll', scheduleSync);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (root.parentElement) {
      root.parentElement.removeChild(root);
    }
    boundEl = null;
  };
}

export function readTouchAxes(): {
  leftAxisTouch: number;
  rightAxisTouch: number;
} {
  return {
    leftAxisTouch: clampAxis(axisP1),
    rightAxisTouch: clampAxis(axisP2),
  };
}
