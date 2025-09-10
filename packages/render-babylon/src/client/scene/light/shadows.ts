// src/client/scene/light/shadows.ts
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { isMobile } from "@client/utils/platform";

export function createSunShadows(sun: DirectionalLight) {
  const mapSize = isMobile() ? 1024 : 2048; // ↑ crisper
  const sg = new ShadowGenerator(mapSize, sun);

  sg.usePercentageCloserFiltering = true;
  sg.useContactHardeningShadow = false;
  sg.filteringQuality = ShadowGenerator.QUALITY_HIGH;

  const addCasters = (...meshes: AbstractMesh[]) => {
    for (const m of meshes) sg.addShadowCaster(m, true);
  };
  const setReceives = (...meshes: AbstractMesh[]) => {
    for (const m of meshes) m.receiveShadows = true;
  };
  return { sg, addCasters, setReceives };
}
