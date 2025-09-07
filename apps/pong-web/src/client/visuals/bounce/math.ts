// src/client/visuals/bounce/math.ts

/** Clamp to [0,1] without Math.min/Math.max branching cost inside hot loops. */
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Quadratic bezier Y (apex at u = 0.5 via peakOffset from max(y0,y1)). */
export const quadBezierY = (
  u: number,
  y0: number,
  y1: number,
  peakOffset: number,
): number => {
  const peakY = Math.max(y0, y1) + peakOffset;
  const one = 1 - u;
  return one * one * y0 + 2 * one * u * peakY + u * u * y1;
};
