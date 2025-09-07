// src/client/fx/context.ts
import type { Scene } from "@babylonjs/core/scene";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { ensureGlow } from "./utils";

export type FXContext = { scene: Scene; glow: GlowLayer };

export function createFXContext(scene: Scene): FXContext {
  return { scene, glow: ensureGlow(scene) };
}
