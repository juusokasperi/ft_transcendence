import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Vector3 } from '@babylonjs/core/Maths/math';

import type { FXContext } from './context';
import type { FXConfig } from './config';
import { DEFAULT_FX_CONFIG } from './config';
import { makePool } from './pool';
import { getBallTint } from './colors';

type Unsub = () => void;

type Actor = { mesh: Mesh; mat: StandardMaterial };

type Seg = {
  actor: Actor;
  ageMs: number;
  lifeMs: number;
  alphaPeak: number;
  lengthStart: number;
};

/**
 * Continuous ball trail made of short-lived, glowing, elongated puffs.
 * - Tint follows ball material.
 * - Spawn cadence and intensity scale with speed.
 */
export function createBallTrailFX(
  ctx: FXContext,
  ballMesh: AbstractMesh,
  ballRadius: number,
  addTicker: (fn: (dt: number) => boolean | void) => Unsub,
  cfg: FXConfig = DEFAULT_FX_CONFIG,
) {
  const { scene } = ctx;
  const T = cfg.trail;
  const maxEmitsPerTick = Math.max(1, T.maxEmitsPerTick);

  // Global knobs
  const S = Math.max(0.0001, cfg.intensity.sizeMul ?? 1);
  const I = Math.max(0.0001, cfg.intensity.alphaMul ?? 1);

  // Base geometry size (radius-relative)
  const baseDiam = Math.max(0.001, ballRadius) * S; // diameter of a unit puff

  // ---------- pooled actors (mesh + material) ----------
  const pool = makePool<Actor>(
    () => {
      const mesh = MeshBuilder.CreateSphere(
        'fx-trail:puff',
        { diameter: baseDiam, segments: 12 },
        scene,
      );
      mesh.isPickable = false;
      mesh.isVisible = false;
      mesh.alwaysSelectAsActiveMesh = false;

      const mat = new StandardMaterial('fx-trail:mat', scene);
      mat.disableLighting = true;
      mat.diffuseColor.set(0, 0, 0);
      mat.specularColor.set(0, 0, 0);
      mat.emissiveColor = getBallTint(ballMesh).scale(T.emissiveScale); // refreshed on spawn
      mat.alpha = 0.0;
      mat.alphaMode = Constants.ALPHA_ADD;
      mat.backFaceCulling = false;
      mat.separateCullingPass = true;
      mat.forceDepthWrite = false;

      mesh.material = mat;
      return { mesh, mat };
    },
    // reset (on release)
    (a) => {
      a.mesh.isVisible = false;
      a.mat.alpha = 0.0;
      a.mesh.scaling.set(1, 1, 1);
      a.mesh.rotation.set(0, 0, 0);
    },
    // dispose
    (a) => {
      a.mesh.dispose(false, true);
      a.mat.dispose();
    },
  );
  pool.warm(T.poolSize);

  // ---------- state ----------
  const active: Seg[] = [];
  let unsub: Unsub | null = null;

  // speed/emit bookkeeping
  const lastPos = new Vector3();
  let hasLast = false;
  let spd = 0; // smoothed speed (units/sec)
  let spawnAccMs = 0;

  function ensureTicker() {
    if (unsub) return;
    unsub = addTicker((dt) => {
      // Update existing segments
      if (active.length) {
        const dtMs = dt * 1000;
        for (let i = active.length - 1; i >= 0; --i) {
          const s = active[i];
          if (!s) continue;
          s.ageMs += dtMs;
          const t = s.ageMs >= s.lifeMs ? 1 : s.ageMs / s.lifeMs;
          const fade = 1 - t;
          // Quadratic falloff; keep lightweight
          s.actor.mat.alpha = s.alphaPeak * fade * fade;
          // Soften the tail length over time
          const lenNow = s.lengthStart * (0.5 + 0.5 * (1 - t));
          s.actor.mesh.scaling.x = lenNow;
          if (t >= 1) {
            active.splice(i, 1);
            pool.release(s.actor);
          }
        }
      }

      // Spawn logic (speed reactive)
      // Skip when ball hidden or no motion reference yet
      if (!ballMesh.isVisible) return true; // stay alive; resume when visible

      const dtMs = dt * 1000;
      spawnAccMs += dtMs;

      const p = ballMesh.position;
      if (!hasLast) {
        lastPos.copyFrom(p);
        hasLast = true;
        return true; // no spawn first frame
      }

      const dx = p.x - lastPos.x;
      const dz = p.z - lastPos.z;
      const dist = Math.hypot(dx, dz);
      const inst = dt > 0 ? dist / Math.max(1e-6, dt) : 0; // units/sec
      // Low-pass (simple EMA)
      spd = spd * 0.7 + inst * 0.3;

      // Spawn cadence maps speed → interval
      const knee = Math.max(0.0001, T.speedKnee);
      const norm = spd / (spd + knee); // 0..1
      const minMs = Math.max(2, T.spawnMsMin);
      const maxMs = Math.max(minMs, T.spawnMsMax);
      const emitEvery = maxMs + (minMs - maxMs) * norm;

      if (spd >= T.speedMin && spawnAccMs >= emitEvery) {
        // Avoid runaway catch-up under big dt; cap to config-defined max.
        let emits = Math.min(maxEmitsPerTick, Math.floor(spawnAccMs / emitEvery));
        spawnAccMs -= emits * emitEvery;
        while (emits-- > 0) spawnOne(dx, dz, norm);
      }

      lastPos.copyFrom(p);
      return true;
    });
  }

  function spawnOne(dx: number, dz: number, norm: number) {
    let actor = pool.acquire();
    if (!actor) {
      const oldest = active.shift();
      if (oldest) {
        pool.release(oldest.actor);
        actor = pool.acquire();
      }
    }
    if (!actor) return;

    // Refresh tint from ball material (so swaps/skins carry over)
    actor.mat.emissiveColor.copyFrom(getBallTint(ballMesh)).scaleInPlace(T.emissiveScale);

    const p = ballMesh.position;
    actor.mesh.position.copyFrom(p);
    actor.mesh.isVisible = true;

    // Align elongated axis with velocity direction (rotate local X to direction)
    const yaw = Math.atan2(dz, dx) || 0; // radians
    actor.mesh.rotation.set(0, yaw, 0);

    // Initial scaling (relative to base sphere)
    const len = 1 + T.lengthMul * norm;
    const thk = Math.max(0.05, T.thicknessMul);
    const hgt = Math.max(0.05, T.heightMul);
    actor.mesh.scaling.set(len, hgt, thk);

    // Alpha peak increases gently with speed, multiplied by global intensity
    const alphaPeak = T.alphaPeak * I * (0.5 + 0.6 * norm);

    active.push({
      actor,
      ageMs: 0,
      lifeMs: T.lifeMs,
      alphaPeak,
      lengthStart: len,
    });

    ensureTicker();
  }

  function dispose() {
    if (unsub) {
      unsub();
      unsub = null;
    }
    active.length = 0;
    pool.clear();
  }

  // Start ticker immediately; it idles cheaply and reacts to speed/visibility
  ensureTicker();
  return { dispose };
}
