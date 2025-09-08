// src/client/fx/utils.ts
import type { Scene } from "@babylonjs/core/scene";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

const HIDE_KEY = "_fxHideCount" as const;

type FXMeta = Record<string, unknown> & { [K in typeof HIDE_KEY]?: number };

function getFXMeta(mesh: AbstractMesh): FXMeta {
  const raw = mesh.metadata;
  if (raw && typeof raw === "object") {
    return raw as FXMeta;
  }
  const fresh: FXMeta = {};
  // Babylon types `metadata` as `any`; assigning a typed bag is safe for us.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  mesh.metadata = fresh as unknown as Record<string, unknown>;
  return fresh;
}

export function ensureGlow(scene: Scene): GlowLayer {
  const found = scene.effectLayers?.find((l) => l.name === "fx-glow") as
    | GlowLayer
    | undefined;
  if (found) return found;
  const glow = new GlowLayer("fx-glow", scene, { mainTextureSamples: 1 });
  glow.intensity = 0.9;
  return glow;
}

export function incHide(mesh: AbstractMesh): void {
  const md = getFXMeta(mesh);
  md[HIDE_KEY] = (md[HIDE_KEY] ?? 0) + 1;
  mesh.isVisible = false;
}

export function decHide(mesh: AbstractMesh): void {
  const md = getFXMeta(mesh);
  md[HIDE_KEY] = Math.max(0, (md[HIDE_KEY] ?? 0) - 1);
  if (md[HIDE_KEY] === 0) mesh.isVisible = true;
}

export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
