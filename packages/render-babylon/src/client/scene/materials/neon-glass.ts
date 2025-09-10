// src/client/scene/materials/neon-glass.ts
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Color3 } from "@babylonjs/core/Maths/math.color";

export function makeNeonGlass(
  scene: Scene,
  base: Color3,
  opts: { alpha?: number; rimScale?: number; emissiveScale?: number } = {},
) {
  const { alpha = 0.18, rimScale = 1.8, emissiveScale = 0.9 } = opts;
  const m = new StandardMaterial("neon-glass", scene);
  m.disableLighting = true;
  m.diffuseColor.set(0, 0, 0);
  m.specularColor.set(0, 0, 0);
  m.emissiveColor = base.clone().scale(emissiveScale);
  m.alpha = alpha;
  m.alphaMode = Constants.ALPHA_COMBINE;
  m.backFaceCulling = false;
  m.separateCullingPass = true;

  const fres = new FresnelParameters();
  fres.isEnabled = true;
  fres.power = 2.0;
  fres.bias = 0.2;
  fres.leftColor = base.clone().scale(rimScale); // edge glow
  fres.rightColor = base.clone().scale(0.25); // interior falloff
  m.emissiveFresnelParameters = fres;

  return m;
}

export function makeNeonLine(
  scene: Scene,
  base: Color3,
  opts: { alpha?: number; intensity?: number } = {},
) {
  const { alpha = 0.85, intensity = 1.6 } = opts;
  const m = new StandardMaterial("neon-line", scene);
  m.disableLighting = true;
  m.diffuseColor.set(0, 0, 0);
  m.specularColor.set(0, 0, 0);
  m.emissiveColor = base.clone().scale(intensity);
  m.alpha = alpha;
  m.alphaMode = Constants.ALPHA_ADD;
  m.backFaceCulling = false;
  m.separateCullingPass = true;
  return m;
}
