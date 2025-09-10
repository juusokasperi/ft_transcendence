// src/client/fx/config.ts
import { Color3 } from "@babylonjs/core/Maths/math";
import { FXColors } from "./colors";

/** One-stop tuning for all FX. */
export type FXConfig = {
  forceField: {
    lifeMs: number;
    poolSize: number;
    baseRadiusMul: number;
    sides: number;
    scaleStart: number;
    scaleEnd: number;
    peakAlpha: number;
    emissiveScale: number;
    fresnel: { power: number; bias: number; rimScale: number };
    tiltDeg: number;
    render: { zOffset: number; renderingGroupId: number };
    speedKnee: number;
  };

  burst: {
    flashMs: number;
    ringMs: number;
    sparkMs: number;
    sparkCount: number;
    poolSize: number;
    flash: {
      diameterMul: number;
      alphaPeak: number;
      grow: { x: number; y: number; z: number };
      segments: number;
    };
    ring: {
      diameterMul: number;
      thicknessMul: number;
      alphaPeak: number;
      scaleStart: number;
      scaleEnd: number;
      tessellation: number;
    };
    sparks: {
      sizeMul: number;
      speedMul: number;
      gravityMul: number;
      alphaPeak: number;
      segments: number;
      upMin: number;
      upJitter: number;
    };
    emissiveScale: { flash: number; ring: number; spark: number };
  };

  /** Camera shake (used on burst) */
  cameraShake: {
    lifeMs: number;
    ampRad: number;
    freqHz: number;
    rollScale: number;
    clampMul: number;
  };

  /** NEW: Serve-selection flicker */
  serveSelect: {
    beatMs: number; // flicker beat
    holdMs: number; // final solid hold
    alpha: number; // peak emissive alpha (multiplied by intensity.alphaMul)
  };

  colors: { core: Color3; ring: Color3; spark: Color3 };
  intensity: { alphaMul: number; sizeMul: number };
};

export const DEFAULT_FX_CONFIG: FXConfig = {
  // ==== Force-field (unchanged look) ====
  forceField: {
    lifeMs: 360,
    poolSize: 8,
    baseRadiusMul: 1.5,
    sides: 6,
    scaleStart: 0.85,
    scaleEnd: 1.2,
    peakAlpha: 0.18,
    emissiveScale: 0.4,
    fresnel: { power: 2.0, bias: 0.2, rimScale: 1.8 },
    tiltDeg: 15.0,
    render: { zOffset: -1, renderingGroupId: 2 },
    speedKnee: 10.0,
  },

  // ==== Burst (as before) ====
  burst: {
    flashMs: 312,
    ringMs: 432,
    sparkMs: 504,
    sparkCount: 6,
    poolSize: 6,
    flash: {
      diameterMul: 2.0,
      alphaPeak: 0.65,
      grow: { x: 1.1, y: 0.6, z: 0.3 },
      segments: 12,
    },
    ring: {
      diameterMul: 5.0,
      thicknessMul: 0.05,
      alphaPeak: 0.35,
      scaleStart: 0.2,
      scaleEnd: 3.0,
      tessellation: 48,
    },
    sparks: {
      sizeMul: 0.22,
      speedMul: 22,
      gravityMul: -60,
      alphaPeak: 0.9,
      segments: 6,
      upMin: 0.35,
      upJitter: 0.25,
    },
    emissiveScale: { flash: 1.0, ring: 1.2, spark: 1.0 },
  },

  // ==== Camera shake (as before) ====
  cameraShake: {
    lifeMs: 320,
    ampRad: 0.006,
    freqHz: 160,
    rollScale: 0.6,
    clampMul: 2.5,
  },

  // ==== NEW: Serve-select (matches your current 120/1000/0.35) ====
  serveSelect: {
    beatMs: 120,
    holdMs: 1000,
    alpha: 0.35,
  },

  colors: {
    core: FXColors.core,
    ring: FXColors.core.scale(1.2),
    spark: FXColors.core.scale(0.9),
  },

  intensity: { alphaMul: 1.0, sizeMul: 1.0 },
};
