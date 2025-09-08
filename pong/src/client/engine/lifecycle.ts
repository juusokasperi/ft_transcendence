// src/client/engine/lifecycle.ts
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";

import { createRenderLoop } from "@client/engine/render-loop";
import { RafTicker } from "@shared/utils/raf-ticker";

type LifecycleOptions = {
  update?: (dtMs: number) => void;
  logicHz?: number; // visible
  hiddenHz?: number; // hidden
  maxSubStepsPerTick?: number;
};

export function createLifecycle(
  engine: Engine,
  scene: Scene,
  options: LifecycleOptions = {},
) {
  const render = createRenderLoop(engine, scene);

  let visibleHz = Math.max(1, options.logicHz ?? 60);
  let hiddenHz = Math.max(1, options.hiddenHz ?? 5);
  const maxSubStepsPerTick = Math.max(1, options.maxSubStepsPerTick ?? 8);

  let accMs = 0;
  let activeHz = document.hidden ? hiddenHz : visibleHz;

  const stepOnce = (dtMs: number) => {
    options.update?.(dtMs);
  };

  // rAF-driven logic; fixed-step accumulator with float step.
  const logicTicker = new RafTicker((dtMs) => {
    accMs += dtMs;
    const stepMs = 1000 / activeHz;
    let steps = 0;

    while (accMs >= stepMs && steps < maxSubStepsPerTick) {
      stepOnce(stepMs);
      accMs -= stepMs;
      steps++;
    }

    if (steps === maxSubStepsPerTick) {
      // prevent runaway backlog after long throttles
      accMs = Math.min(accMs, stepMs);
    }
  });

  const applyVisible = () => {
    activeHz = visibleHz;
    const stepMs = 1000 / activeHz;
    accMs = Math.min(accMs, stepMs);
    if (!render.isRunning()) render.start();
  };

  const applyHidden = () => {
    activeHz = hiddenHz;
    const stepMs = 1000 / activeHz;
    accMs = Math.min(accMs, stepMs);
    // If you prefer, you could stop rendering here to save GPU.
    // render.stop();
  };

  const onVisibility = () => (document.hidden ? applyHidden() : applyVisible());
  const visHandler = () => onVisibility();

  return {
    start() {
      render.start(); // idempotent
      logicTicker.start(); // idempotent
      onVisibility();
      document.addEventListener("visibilitychange", visHandler);
    },

    stop() {
      document.removeEventListener("visibilitychange", visHandler);
      logicTicker.stop();
      render.stop();
    },

    setRates({ visible, hidden }: { visible?: number; hidden?: number }) {
      if (visible) visibleHz = Math.max(1, visible);
      if (hidden) hiddenHz = Math.max(1, hidden);
      const stepMs = 1000 / (document.hidden ? hiddenHz : visibleHz);
      accMs = Math.min(accMs, stepMs);
      onVisibility();
    },
  };
}
