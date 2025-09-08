// src/client/fx/colors.ts
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Color3 } from "@babylonjs/core/Maths/math";

/**
 * Shared FX palette.
 * - `core` is the generic UI/FX tint (unchanged).
 * - `ballFallback` is used if we can't read a color from the ball's material.
 *   (Matches the default ball color in the scene.)
 */
export const FXColors = {
  core: new Color3(0.25, 0.7, 1.0),
  ballFallback: new Color3(1.0, 0.4, 0.0),
};

/**
 * Resolve a tint from a ball mesh material.
 * Supports StandardMaterial (diffuseColor) and PBRMaterial (albedoColor).
 * Returns a CLONE to keep callers side-effect free.
 */
export function getBallTint(ballMesh: AbstractMesh | null | undefined): Color3 {
  const mat: any = ballMesh?.material;
  // StandardMaterial path
  if (mat?.diffuseColor) {
    const c = mat.diffuseColor as Color3;
    return c.clone?.() ?? new Color3(c.r, c.g, c.b);
  }
  // PBRMaterial path
  if (mat?.albedoColor && typeof mat.albedoColor.toColor3 === "function") {
    return mat.albedoColor.toColor3();
  }
  // Fallback (scene default)
  return FXColors.ballFallback.clone();
}
