// src/client/fx/serve-select.ts
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"; // ← correct casing
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Color3 } from "@babylonjs/core/Maths/math";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { FXContext } from "./context";
import { easeOutQuad } from "./utils";
import type { TableEnd } from "@shared/domain/ids";
import { Colors } from "@client/scene/color";
import { SERVE_SELECT_TOTAL_MS } from "@shared/domain/timing";
import type { FXConfig } from "./config";
import { DEFAULT_FX_CONFIG } from "./config";

type Side = "left" | "right";
const sideOf = (end: TableEnd): Side => (end === "east" ? "left" : "right");

type Overlay = { mesh: AbstractMesh; mat: StandardMaterial };
type Unsub = () => void;

export function createServeSelectionFX(
  ctx: FXContext,
  tableTop: AbstractMesh,
  addTicker?: (fn: (dt: number) => boolean | void) => Unsub, // central ticker
  cfg: FXConfig = DEFAULT_FX_CONFIG,
) {
  const { scene } = ctx;

  // --- Geometry: two thin overlays over each half (unchanged look/size) ---
  tableTop.computeWorldMatrix(true);
  const bb = tableTop.getBoundingInfo().boundingBox;
  const lengthX = bb.extendSizeWorld.x * 2;
  const widthZ = bb.extendSizeWorld.z * 2;
  const y = tableTop.position.y + 0.003;
  const halfX = lengthX / 2;

  const makeHalf = (
    name: string,
    sx: number,
    sz: number,
    px: number,
    tint: Color3,
  ): Overlay => {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: sx, depth: sz, height: 0.006 },
      scene,
    );
    mesh.position.copyFromFloats(px, y, 0);
    mesh.isPickable = false;
    mesh.parent = tableTop.parent;
    mesh.isVisible = false;

    const mat = new StandardMaterial(name + ":mat", scene);
    mat.disableLighting = true;
    mat.diffuseColor.set(0, 0, 0);
    mat.specularColor.set(0, 0, 0);
    mat.emissiveColor = tint.clone();
    mat.alpha = 0.0;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.separateCullingPass = true;

    mesh.material = mat;
    return { mesh, mat };
  };

  const left = makeHalf(
    "serveFX-left",
    halfX,
    widthZ,
    -halfX / 2,
    Colors.paddleLeft,
  );
  const right = makeHalf(
    "serveFX-right",
    halfX,
    widthZ,
    +halfX / 2,
    Colors.paddleRight,
  );

  // --- Tunables: config first, options can override; alpha multiplied by global intensity
  const beatMs = Math.max(40, cfg.serveSelect.beatMs);
  const holdMs = Math.max(0, cfg.serveSelect.holdMs);
  const peakA =
    Math.max(0, Math.min(1, cfg.serveSelect.alpha)) *
    Math.max(0.0001, cfg.intensity.alphaMul ?? 1);

  const flickerMs = Math.max(0, SERVE_SELECT_TOTAL_MS - holdMs);

  // ---------- Central ticker state (same math/feel as before) ----------
  let unsub: Unsub | null = null;
  let running: null | {
    target: Side;
    startMs: number;
    beats: number;
    resolve: () => void;
  } = null;

  function stopTicker() {
    if (unsub) {
      unsub();
      unsub = null;
    }
  }

  function setFinal(target: Side) {
    left.mesh.isVisible = right.mesh.isVisible = true;
    left.mat.alpha = target === "left" ? peakA : 0.0;
    right.mat.alpha = target === "right" ? peakA : 0.0;
  }

  function hideAll() {
    left.mesh.isVisible = right.mesh.isVisible = false;
    left.mat.alpha = right.mat.alpha = 0.0;
  }

  function startTickerIfNeeded() {
    if (unsub || !addTicker) return;
    unsub = addTicker(() => {
      if (!running) return false;

      const tNow = performance.now();
      const t = tNow - running.startMs;

      if (t < flickerMs) {
        const i = Math.min(running.beats - 1, Math.floor(t / beatMs));
        const onOppositeFirst = i % 2 === 0;
        const active: Side = onOppositeFirst
          ? running.target === "left"
            ? "right"
            : "left"
          : running.target;

        const within = (t % beatMs) / beatMs;
        const pulse = 1.0 - easeOutQuad(1 - within);
        const a = peakA * pulse;

        left.mesh.isVisible = right.mesh.isVisible = true;
        left.mat.alpha = active === "left" ? a : 0.0;
        right.mat.alpha = active === "right" ? a : 0.0;

        return true;
      }

      if (t < flickerMs + holdMs) {
        setFinal(running.target);
        return true;
      }

      hideAll();
      const done = running;
      running = null;
      done.resolve();
      return false;
    });
  }

  async function trigger(targetEnd: TableEnd): Promise<void> {
    // even # of beats → ends on target side for the hold
    let beats = Math.max(2, Math.floor(flickerMs / beatMs));
    if (beats % 2 === 1) beats--;

    if (running) {
      hideAll();
      const prev = running;
      running = null;
      prev.resolve();
      stopTicker();
    }

    if (!addTicker) {
      // fallback path (kept intact)
      await legacyTrigger(targetEnd);
      return;
    }

    await new Promise<void>((resolve) => {
      running = {
        target: sideOf(targetEnd),
        startMs: performance.now(),
        beats,
        resolve,
      };
      startTickerIfNeeded();
    });
  }

  // Original onBeforeRender version (kept for completeness)
  async function legacyTrigger(targetEnd: TableEnd): Promise<void> {
    const targetSide = sideOf(targetEnd);
    let beats = Math.max(2, Math.floor(flickerMs / beatMs));
    if (beats % 2 === 1) beats--;

    const start = performance.now();
    const sub = scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() - start;

      if (t < flickerMs) {
        const i = Math.min(beats - 1, Math.floor(t / beatMs));
        const onOppositeFirst = i % 2 === 0;
        const active: Side = onOppositeFirst
          ? targetSide === "left"
            ? "right"
            : "left"
          : targetSide;

        const within = (t % beatMs) / beatMs;
        const pulse = 1.0 - easeOutQuad(1 - within);
        const alpha = peakA * pulse;

        left.mesh.isVisible = right.mesh.isVisible = true;
        left.mat.alpha = active === "left" ? alpha : 0.0;
        right.mat.alpha = active === "right" ? alpha : 0.0;
        return;
      }

      scene.onBeforeRenderObservable.remove(sub);
      setFinal(targetSide);
      setTimeout(() => hideAll(), holdMs);
    });

    await new Promise<void>((r) => setTimeout(r, SERVE_SELECT_TOTAL_MS + 20));
  }

  function dispose() {
    stopTicker();
    hideAll();
    left.mesh.dispose(false, true);
    right.mesh.dispose(false, true);
    left.mat.dispose();
    right.mat.dispose();
  }

  return { trigger, dispose };
}
