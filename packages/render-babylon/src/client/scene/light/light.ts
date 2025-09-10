// src/client/scene/light/light.ts
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { Colors } from "@client/scene/color";

/** Simple hemispheric light: soft key + subtle ground bounce. */
export function setupLight(scene: Scene) {
  const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
  light.intensity = 0.3;
  light.diffuse = Colors.light.hemi.diffuse;
  light.specular = Colors.light.hemi.specular;
  light.groundColor = Colors.light.hemi.ground;
  return light;
}

/** Sun-like directional light without angle math. */
export function setupSun(scene: Scene) {
  // Create with any initial direction; we'll override it right after.
  const sun = new DirectionalLight("sun", new Vector3(0, -1, 0), scene);
  sun.intensity = 1.6;
  sun.diffuse = Colors.light.sun.diffuse;
  sun.specular = Colors.light.sun.specular;
  sun.position = new Vector3(-12, 18, 8);
  sun.setDirectionToTarget(Vector3.Zero()); // aim at table center

  return sun;
}

/** High-level: set up hemi + sun in one call. */
export function setupLights(scene: Scene) {
  const hemi = setupLight(scene);
  const sun = setupSun(scene);
  return { hemi, sun };
}
