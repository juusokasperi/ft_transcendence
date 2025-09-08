// src/client/scene/materials/glass.ts
import type { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Constants } from "@babylonjs/core/Engines/constants";

/**
 * Physically-based glass (preferred).
 * Looks best when scene.environmentTexture is set (IBL/HDR).
 */
export function makePhysicalGlass(
  scene: Scene,
  tint: Color3 = new Color3(0.7, 0.85, 1.0),
  opts: {
    ior?: number; // ~1.5 for glass
    roughness?: number; // lower = sharper reflections
    refraction?: number; // 0..1 refracted contribution
    clearCoat?: number; // 0..1 coat intensity
    backFaceCulling?: boolean;

    // NEW CONTROLS
    opacity?: number; // 0..1 : 1 = more opaque (less see-through)
    tintDistance?: number; // how quickly tint accumulates (lower = denser color)
    thickness?: number; // virtual thickness in meters (higher = denser)
    tintStrength?: number; // scale applied to tint color (1 = unchanged)
  } = {},
) {
  const {
    ior = 1.5,
    roughness = 0.03,
    refraction = 1.0,
    clearCoat = 1.0,
    backFaceCulling = false,

    opacity = 1.0,
    tintDistance = 1.0,
    thickness = 0.4, // bumped default for a denser look
    tintStrength = 1.0,
  } = opts;

  const m = new PBRMaterial("glassPBR", scene);
  m.metallic = 0.0;
  m.roughness = roughness;
  m.albedoColor = Color3.White();
  m.useRadianceOverAlpha = true;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.alpha = opacity; // raise toward 1.0 to be more opaque
  m.backFaceCulling = backFaceCulling;
  m.separateCullingPass = true;

  // Refraction + absorption (tint)
  m.subSurface.isRefractionEnabled = true;
  m.subSurface.indexOfRefraction = ior;
  m.subSurface.refractionIntensity = refraction; // lower to reduce see-through
  m.subSurface.tintColor = tint.clone().scale(tintStrength);
  m.subSurface.tintColorAtDistance = tintDistance; // lower = stronger tint per unit thickness
  m.subSurface.minimumThickness = 0.0;
  m.subSurface.maximumThickness = thickness; // higher = denser absorption

  // Crisp specular layer
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = clearCoat;
  m.clearCoat.roughness = 0.0;

  return m;
}

/**
 * Lightweight fallback using StandardMaterial.
 * Use if you don't have an environment texture and still want a "glass-like" look.
 */
export function makeSimpleGlass(
  scene: Scene,
  tint: Color3 = new Color3(0.7, 0.85, 1.0),
  alpha = 0.25, // 0 transparent .. 1 opaque
) {
  const m = new StandardMaterial("glassSimple", scene);
  m.disableLighting = false;
  m.diffuseColor = tint.clone(); // use tint directly
  m.specularColor = Color3.White();
  m.emissiveColor = Color3.Black();
  m.alpha = alpha; // raise toward 1 for more opaque
  m.alphaMode = Constants.ALPHA_COMBINE;
  m.backFaceCulling = false;
  m.separateCullingPass = true;
  return m;
}

/**
 * Convenience: choose PBR glass when an env texture exists, else StandardMaterial fallback.
 */
export function makeGlass(
  scene: Scene,
  tint: Color3 = new Color3(0.7, 0.85, 1.0),
  opts?: Parameters<typeof makePhysicalGlass>[2],
) {
  if (scene.environmentTexture) {
    return makePhysicalGlass(scene, tint, opts);
  }
  // Map "opacity" (1=opaque) to StandardMaterial alpha directly.
  const alpha = opts?.opacity ?? 0.25;
  return makeSimpleGlass(scene, tint, alpha);
}
