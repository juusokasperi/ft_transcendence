import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Creates and configures the scene camera.
 *
 * Fixed, stable framing:
 *  - no user input
 *  - near/far clip tuned for a small scene
 */
export function setupCamera(scene: Scene) {
  const target = Vector3.Zero();
  const name = 'cam';
  const alpha = Math.PI * 1.5; // horizontal angle in radians (~270°)
  const beta = Math.PI / 4.5; // vertical angle in radians (~40°)
  const radius = 3; // distance from target in meters

  const camera = new ArcRotateCamera(name, alpha, beta, radius, target, scene);

  camera.inputs.clear();
  camera.minZ = 0.01;
  camera.maxZ = 50;

  return camera;
}

/**
 * Orbit the given ArcRotateCamera around its current target for the given duration.
 * - Keeps radius and beta constant; animates alpha by `angleRad` (default 2π).
 * - Uses the scene's onBeforeRenderObservable; returns a disposer to cancel early.
 */
export function orbitCameraFor(
  camera: ArcRotateCamera,
  durationMs: number,
  opts?: {
    angleRad?: number;
    ease?: (t: number) => number;
    onHalf?: () => void; // fired once when progress >= 0.5
    onDone?: () => void; // fired when the orbit completes
  },
): () => void {
  const scene = camera.getScene();
  const total = Math.max(1, durationMs | 0);
  const angle = opts?.angleRad ?? Math.PI * 2;
  const ease = opts?.ease ?? ((t: number) => t);

  const startAlpha = camera.alpha;
  const start = performance.now();

  let halfFired = false;
  const sub = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const t = Math.min(1, (now - start) / total);
    const k = ease(t);
    camera.alpha = startAlpha + angle * k;
    if (!halfFired && t >= 0.5) {
      halfFired = true;
      opts?.onHalf?.();
    }
    if (t >= 1) {
      scene.onBeforeRenderObservable.remove(sub);
      opts?.onDone?.();
    }
  });

  return () => scene.onBeforeRenderObservable.remove(sub);
}
