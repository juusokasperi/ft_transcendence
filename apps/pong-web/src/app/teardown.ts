// src/app/teardown.ts
import type { Disposable } from "@shared/utils/disposable";

type LoopLike = { stop(): void };
type DisposerLike = { dispose(): void };
type NetLike = { disconnect(): void };

/** One-stop, idempotent teardown for app instances. */
export function disposeWorld(deps: {
  loop: LoopLike;
  engineDisposable: Disposable;
  world?: DisposerLike; // preferred: owns the Scene
  scene?: { dispose(): void; isDisposed?: boolean }; // fallback if you don't pass world
  fx?: DisposerLike;
  hud?: DisposerLike;
  net?: NetLike;
}): void {
  // 1) stop ticks first
  try {
    deps.loop.stop();
  } catch {}

  // 2) cut network early so nothing new flows in
  try {
    deps.net?.disconnect();
  } catch {}

  // 3) UI/FX (DOM & Babylon effect layers) before scene teardown
  try {
    deps.hud?.dispose();
  } catch {}
  try {
    deps.fx?.dispose();
  } catch {}

  // 4) world/scene then engine
  if (deps.world) {
    try {
      deps.world.dispose(); // also disposes Scene
    } catch {}
  } else if (deps.scene) {
    try {
      if (!(deps.scene as any).isDisposed) deps.scene.dispose();
    } catch {}
  }

  try {
    deps.engineDisposable.dispose();
  } catch {}
}
