// src/client/fx/camera-shake.ts
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import type { FXContext } from "./context";
import type { FXConfig } from "./config";
import { DEFAULT_FX_CONFIG } from "./config";

type Unsub = () => void;

type Shake = {
  ageMs: number;
  lifeMs: number;
  amp: number; // radians
  fxHz: number; // base frequency
  seedX: number; // phase seeds (radians)
  seedY: number;
  seedZ: number;
};

export function createCameraShakeFX(
  ctx: FXContext,
  camera: ArcRotateCamera,
  addTicker: (fn: (dt: number) => boolean | void) => Unsub,
  cfg: FXConfig = DEFAULT_FX_CONFIG,
) {
  const { scene } = ctx;

  // Parent node to nudge the camera without touching alpha/beta/target directly.
  const root = new TransformNode("fx-cam-shake-root", scene);
  const prevParent = camera.parent as TransformNode | null;
  camera.parent = root;

  // Tunables (read from config; keep behavior 1:1 with previous hard-coded values)
  const INT = Math.max(0.001, cfg.intensity.sizeMul || 1);
  const P = cfg.cameraShake;
  const BASE_MS = P.lifeMs;
  const BASE_ANG = P.ampRad * INT; // intensity scales amplitude as before
  const BASE_HZ = P.freqHz;

  const active: Shake[] = [];
  let unsub: Unsub | null = null;

  function ensureTicker() {
    if (unsub) return;
    unsub = addTicker((dt) => {
      if (active.length === 0) {
        // reset transform and stop ticking
        root.rotation.set(0, 0, 0);
        unsub = null;
        return false;
      }

      const dtMs = dt * 1000;
      let rx = 0,
        ry = 0,
        rz = 0;

      for (let i = active.length - 1; i >= 0; --i) {
        const s = active[i];
        s.ageMs += dtMs;

        const t01 = s.ageMs >= s.lifeMs ? 1 : s.ageMs / s.lifeMs;

        // Quad falloff → snappy start, gentle tail
        const fall = 1 - t01;
        const ampNow = s.amp * fall * fall;

        // Tri-sin blend per axis (deterministic, branchless)
        const t = s.ageMs / 1000;
        const wx = s.fxHz * (1.0 + 0.15 * Math.sin(1.7 * t + s.seedX));
        const wy = s.fxHz * (1.1 + 0.2 * Math.sin(1.3 * t + s.seedY));
        const wz = s.fxHz * (0.9 + 0.1 * Math.sin(1.9 * t + s.seedZ));

        rx +=
          ampNow *
          (Math.sin(wx * t + s.seedX) + 0.5 * Math.sin(0.5 * wx * t + s.seedY));
        ry +=
          ampNow *
          (Math.sin(wy * t + s.seedY) + 0.5 * Math.sin(0.5 * wy * t + s.seedZ));
        rz +=
          ampNow *
          (Math.sin(wz * t + s.seedZ) +
            0.5 * Math.sin(0.5 * wz * t + s.seedX)) *
          P.rollScale; // keep roll gentler (configurable)
        if (t01 >= 1) active.splice(i, 1);
      }

      // Clamp for overlapping kicks
      const LIM = BASE_ANG * P.clampMul;
      root.rotation.set(
        Scalar.Clamp(rx, -LIM, LIM),
        Scalar.Clamp(ry, -LIM, LIM),
        Scalar.Clamp(rz, -LIM, LIM),
      );

      return true;
    });
  }

  function trigger(strength = 1.0, ms = BASE_MS) {
    const now = performance.now();
    const rand = (k: number) =>
      (Math.sin((now + k * 123.456) * 0.001) * Math.PI) % (Math.PI * 2);

    const s: Shake = {
      ageMs: 0,
      lifeMs: Math.max(60, ms | 0),
      amp: BASE_ANG * Math.max(0, strength),
      fxHz: BASE_HZ * (0.95 + Math.abs(Math.sin(now * 0.003)) * 0.1),
      seedX: rand(1),
      seedY: rand(2),
      seedZ: rand(3),
    };

    active.push(s);
    ensureTicker();
  }

  function dispose() {
    if (unsub) {
      unsub();
      unsub = null;
    }
    active.length = 0;
    root.rotation.set(0, 0, 0);
    camera.parent = prevParent;
    root.dispose();
  }

  return { trigger, dispose };
}
