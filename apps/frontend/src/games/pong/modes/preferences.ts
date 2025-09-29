// Utility helpers for color parsing and material tinting in local mode

import type { Ruleset } from '@pong/shared';

export type ControllerScheme = 'wasd' | 'arrows';

export type PlayerPreferences = {
  name: string;
  paddleColor: string;
  controller: ControllerScheme;
};

export type Preferences = {
  player1: PlayerPreferences;
  player2: PlayerPreferences;
  /** Optional per-user match rules overrides for local mode. */
  rules?: Partial<Ruleset>;
};

export type NamesByEnd = { east: string; west: string };

// Parse #RRGGBB or #RRGGBBAA into normalized RGB 0..1
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hex);
  if (!m) return null;
  const rgb = m[1]!;
  const r = parseInt(rgb.slice(0, 2), 16) / 255;
  const g = parseInt(rgb.slice(2, 4), 16) / 255;
  const b = parseInt(rgb.slice(4, 6), 16) / 255;
  return { r, g, b };
}

// Convert normalized RGB (0..1) to CSS rgb() string
export function rgb01ToCss(c: { r: number; g: number; b: number }): string {
  const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const r = Math.round(clamp(c.r) * 255);
  const g = Math.round(clamp(c.g) * 255);
  const b = Math.round(clamp(c.b) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

// Try to update a Babylon material's tint color in a version-agnostic way
export function setGlassTint(mat: unknown, rgb: { r: number; g: number; b: number }) {
  const m: any = mat as any;
  // PBR path (subSurface tint)
  if (m?.subSurface?.tintColor?.set) {
    m.subSurface.tintColor.set(rgb.r, rgb.g, rgb.b);
    if (m.albedoColor?.set) m.albedoColor.set(1, 1, 1);
    return;
  }
  // Standard material path (diffuseColor)
  if (m?.diffuseColor?.set) {
    m.diffuseColor.set(rgb.r, rgb.g, rgb.b);
    return;
  }
}

// Apply preferences to names and paddle materials
export function applyPreferences(
  prefs: Preferences | undefined,
  opts: {
    setNames: (n: NamesByEnd) => void;
    leftMaterial: unknown;
    rightMaterial: unknown;
    rowsMirrored: boolean;
  },
) {
  if (!prefs) return;
  // Update player names (top row = P1/east)
  opts.setNames({ east: prefs.player1.name, west: prefs.player2.name });

  // Update paddle colors; follow players across swaps
  const c1 = hexToRgb(prefs.player1.paddleColor);
  const c2 = hexToRgb(prefs.player2.paddleColor);
  if (!c1 || !c2) return;

  const leftMat: any = opts.leftMaterial as any;
  const rightMat: any = opts.rightMaterial as any;
  leftMat?.unfreeze?.();
  rightMat?.unfreeze?.();
  if (!opts.rowsMirrored) {
    setGlassTint(leftMat, c1);
    setGlassTint(rightMat, c2);
  } else {
    setGlassTint(leftMat, c2);
    setGlassTint(rightMat, c1);
  }
  leftMat?.freeze?.();
  rightMat?.freeze?.();
}
