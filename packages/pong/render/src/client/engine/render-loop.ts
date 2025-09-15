import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';

export function createRenderLoop(engine: Engine, scene: Scene, preRender?: () => void) {
  let running = false;

  const frame = () => {
    // Guard against teardown races
    const e = engine as Engine & { isDisposed?: boolean };
    if (e.isDisposed === true || scene.isDisposed) return;
    preRender?.();
    scene.render();
  };

  return {
    start() {
      if (running) return;
      running = true;
      console.log('[RenderLoop] frame type:', typeof frame, frame);
      engine.runRenderLoop(frame);
    },
    stop() {
      if (!running) return;
      engine.stopRenderLoop(frame);
      running = false;
    },
    setPreRender(fn?: () => void) {
      preRender = fn;
    },
    isRunning(): boolean {
      return running;
    },
  };
}
