import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';

export function createRenderLoop(
  engine: Engine,
  scene: Scene,
  preRender?: () => void,
  targetFps = 60,
) {
  let loop: (() => void) | null = null;
  const frameInterval = targetFps > 0 ? 1000 / targetFps : 0;
  let lastRenderAt = performance.now();

  const frame = () => {
    const now = performance.now();
    if (frameInterval && now - lastRenderAt < frameInterval) return;

    lastRenderAt = frameInterval ? now - ((now - lastRenderAt) % frameInterval) : now;

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
