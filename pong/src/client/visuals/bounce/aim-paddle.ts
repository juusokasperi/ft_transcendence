// src/client/visuals/bounce/aim-paddle.ts
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

/**
 * Returns a Y on the paddle face for a given 0..1 fraction (bottom..top).
 */
export function aimYWithFraction(
  paddle: AbstractMesh,
  frac01: number,
  paddleHeight: number,
): number {
  const cy = paddle.position.y;
  return cy - paddleHeight + 2 * paddleHeight * frac01;
}
