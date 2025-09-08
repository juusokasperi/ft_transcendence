// src/client/engine/engine.ts
import { Engine } from "@babylonjs/core/Engines/engine";
import type { EngineOptions } from "@babylonjs/core/Engines/thinEngine";

import { isMobile } from "@client/utils/platform";
import type { Disposable } from "@shared/utils/disposable";

export interface EngineKit {
  engine: Engine;
  engineDisposable: Disposable;
  isContextLost: () => boolean;
}

export function createEngine(canvas: HTMLCanvasElement): EngineKit {
  const opts: EngineOptions = {
    alpha: false,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
    adaptToDeviceRatio: true,
  };

  // Antialias: disable on mobile for perf/battery;
  // host can override elsewhere if needed.
  const engine = new Engine(canvas, !isMobile(), opts);

  // --- Window and canvas resize plumbing ---
  let ac: AbortController | null = new AbortController();
  const onResize = () => {
    try {
      engine.resize();
    } catch (e) {
      // Resize can throw during context transitions
      console.warn("[Engine] resize() failed:", e);
    }
  };
  window.addEventListener("resize", onResize, {
    signal: ac.signal,
  });

  let ro: ResizeObserver | null = new ResizeObserver(() => onResize());
  ro.observe(canvas);

  // --- GPU context lifecycle (online-ready hygiene) ---
  // We don't start/stop render here (render loop is owned by Lifecycle),
  // but we expose a flag and make sure size/buffer is rebound on restore.
  let contextLost = false;

  const lostToken = engine.onContextLostObservable.add(() => {
    contextLost = true;
    // Keep this layer passive: Lifecycle/RenderLoop can decide to pause if desired.
    console.warn(
      "[Engine] WebGL context lost — visuals paused until restored.",
    );
  });

  const restoredToken = engine.onContextRestoredObservable.add(() => {
    // Re-bind backbuffer size etc.
    contextLost = false;
    try {
      engine.resize();
    } catch (e) {
      console.warn("[Engine] resize() after context restore failed:", e);
    }
    // Lifecycle will typically restart/continue rendering; we stay agnostic here.
    console.info("[Engine] WebGL context restored.");
  });

  let disposed = false;
  const engineDisposable: Disposable = {
    dispose() {
      if (disposed) return;
      disposed = true;

      // observables
      try {
        engine.onContextLostObservable.remove(lostToken);
        engine.onContextRestoredObservable.remove(restoredToken);
      } catch {}

      // listeners/observers
      try {
        if (ac) {
          ac.abort(); // removes window.resize listener
          ac = null;
        }
      } catch {}
      try {
        if (ro) {
          ro.disconnect();
          ro = null;
        }
      } catch {}

      // engine
      try {
        engine.dispose();
      } catch {}
    },
  };

  return {
    engine,
    engineDisposable,
    isContextLost: () => contextLost,
  };
}
