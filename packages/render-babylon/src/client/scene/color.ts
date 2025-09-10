// src/client/scene/color.ts
import { Color3 } from "@babylonjs/core/Maths/math.color";

/**
 * Centralized palette for scene objects (meshes, lights, background).
 */
export const Colors = {
  // ==== Ball & Paddles ====
  ball: new Color3(1.0, 0.4, 0.0), // bright orange
  paddleLeft: new Color3(1.0, 0.2, 0.6), // magenta / pink neon
  paddleRight: new Color3(0.4, 1.0, 0.5), // lime green neon

  // ==== Table ====
  tableTop: new Color3(0.3, 0.7, 1.0), // deep navy blue
  tableNet: new Color3(0.3, 0.7, 1.0), // cyan edges

  // ==== Background (new) ====
  bg: {
    star: new Color3(1, 1, 1), // stars
    space: new Color3(0.01, 0.01, 0.05), // deep space
  },

  // ==== Lights (new) ====
  light: {
    hemi: {
      diffuse: Color3.White(),
      specular: Color3.Black(),
      ground: new Color3(0.2, 0.2, 0.25),
    },
    sun: {
      diffuse: new Color3(1.0, 0.96, 0.9), // warm white
      specular: new Color3(1.0, 0.96, 0.9),
    },
  },

  // ==== Material helpers ====
  material: {
    specularNone: Color3.Black(),
  },
} as const;
