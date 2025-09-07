// src/shared/utils/math.ts
export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
