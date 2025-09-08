// src/client/engine/render-loop.ts
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";

export function createRenderLoop(
  engine: Engine,
  scene: Scene,
  preRender?: () => void,
) {
  let loop: (() => void) | null = null;

  const frame = () => {
    // Guard against teardown races
    const e = engine as Engine & { isDisposed?: boolean };
    if (e.isDisposed === true || scene.isDisposed) return;
    preRender?.();
    scene.render();
  };

  return {
    start() {
      if (loop) return;
      loop = frame;
      engine.runRenderLoop(loop);
    },
    stop() {
      if (!loop) return;
      engine.stopRenderLoop(loop);
      loop = null;
    },
    setPreRender(fn?: () => void) {
      preRender = fn;
    },
    isRunning(): boolean {
      return loop !== null;
    },
  };
}
