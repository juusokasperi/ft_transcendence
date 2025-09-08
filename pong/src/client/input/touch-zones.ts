// src/client/input/touchZones.ts
type TouchSide = "left" | "right";

type ActiveTouch = {
  id: number;
  side: TouchSide;
  startY: number;
  lastY: number;
};

const active: Map<number, ActiveTouch> = new Map();
let leftAxisTouch = 0; // -1..1
let rightAxisTouch = 0; // -1..1

/** Convert vertical pixel delta to a normalized axis with deadzone. */
function sign01(v: number, dead = 8, max = 64): number {
  const mag = Math.abs(v);
  if (mag <= dead) return 0;
  const scaled = Math.min(1, (mag - dead) / (max - dead));
  return v < 0 ? +scaled : -scaled; // up (negative dy) => +axis
}

export type TouchDetach = () => void;

/** Split element into left/right halves; swipes map to axis for each side. */
export function attachTouchZones(el: HTMLElement): TouchDetach {
  const opts = { passive: false as const };

  const getSide = (clientX: number): TouchSide => {
    const r = el.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    return clientX < mid ? "left" : "right";
  };

  const onStart = (ev: TouchEvent) => {
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches.item(i)!;
      active.set(t.identifier, {
        id: t.identifier,
        side: getSide(t.clientX),
        startY: t.clientY,
        lastY: t.clientY,
      });
    }
    ev.preventDefault();
  };

  const onMove = (ev: TouchEvent) => {
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches.item(i)!;
      const a = active.get(t.identifier);
      if (!a) continue;
      const dy = a.startY - t.clientY; // up => positive
      const axis = sign01(-dy); // invert so up => +1
      if (a.side === "left") leftAxisTouch = axis;
      else rightAxisTouch = axis;
      a.lastY = t.clientY;
    }
    ev.preventDefault();
  };

  const onEndCancel = (ev: TouchEvent) => {
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches.item(i)!;
      const a = active.get(t.identifier);
      if (!a) continue;
      if (a.side === "left") leftAxisTouch = 0;
      else rightAxisTouch = 0;
      active.delete(t.identifier);
    }
    ev.preventDefault();
  };

  el.addEventListener("touchstart", onStart, opts);
  el.addEventListener("touchmove", onMove, opts);
  el.addEventListener("touchend", onEndCancel, opts);
  el.addEventListener("touchcancel", onEndCancel, opts);

  return () => {
    el.removeEventListener("touchstart", onStart as any);
    el.removeEventListener("touchmove", onMove as any);
    el.removeEventListener("touchend", onEndCancel as any);
    el.removeEventListener("touchcancel", onEndCancel as any);
    active.clear();
    leftAxisTouch = 0;
    rightAxisTouch = 0;
  };
}

export function readTouchAxes(): {
  leftAxisTouch: number;
  rightAxisTouch: number;
} {
  const clamp1 = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  return {
    leftAxisTouch: clamp1(leftAxisTouch),
    rightAxisTouch: clamp1(rightAxisTouch),
  };
}
