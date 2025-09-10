// src/client/scene/camera/camera.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Creates and configures the scene camera.
 *
 * Fixed, stable framing:
 *  - no user input
 *  - near/far clip tuned for a small scene
 */
export function setupCamera(scene: Scene) {
  const target = Vector3.Zero();
  const name = "cam";
  const alpha = Math.PI * 1.5; // horizontal angle in radians (~270°)
  const beta = Math.PI / 3.0; // vertical angle in radians (~60°)
  const radius = 3; // distance from target in meters

  const camera = new ArcRotateCamera(name, alpha, beta, radius, target, scene);

  camera.inputs.clear();
  camera.minZ = 0.01;
  camera.maxZ = 50;

  return camera;
}
