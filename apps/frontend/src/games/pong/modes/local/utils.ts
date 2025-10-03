import type { DomScoreboardAPI } from '@pong/render';
import { setPaddleColors } from '@pong/render';
import type { Preferences } from '../preferences';
import { hexToRgb, rgb01ToCss } from '../preferences';
import type { TableEnd } from '@pong/shared';
import { xorshift32, deriveSeed32 } from '@pong/shared';

/**
 * Update HUD name colors and global FX palette from user preferences.
 * Respects current rows mirroring so left/right map to the correct player.
 */
export function setHudAndPaletteColorsFromPrefs(
  hud: DomScoreboardAPI,
  prefs: Preferences,
  rowsMirrored: boolean,
): void {
  const c1 = hexToRgb(prefs.player1.paddleColor);
  const c2 = hexToRgb(prefs.player2.paddleColor);
  if (!c1 || !c2) return;

  // HUD: names show player colors (P1 top/east, P2 bottom/west)
  hud.setPlayerNameColors(rgb01ToCss(c1), rgb01ToCss(c2));

  // FX palette follows current side mapping (mirrored or not)
  const leftRGB = rowsMirrored ? c2 : c1;
  const rightRGB = rowsMirrored ? c1 : c2;
  setPaddleColors(leftRGB, rightRGB);
}

/**
 * Compute a safe serve angle (in degrees) so the ball won't hit side walls
 * before reaching the paddle plane, leaving a small padding from the borders.
 * Uses a deterministic seed derived from `matchSeed` and `serveIndex` so each
 * serve in a match varies but remains reproducible.
 */
export function pickSafeServeAngleDeg(
  matchSeed: number,
  bounds: {
    halfWidthZ: number;
    ballRadius: number;
    leftPaddleX: number;
    rightPaddleX: number;
  },
  server: TableEnd,
  serveIndex: number,
  padMeters: number = 0.03,
): number {
  const seed = deriveSeed32(matchSeed, serveIndex, server === 'east' ? 0 : 1);
  const rng = xorshift32(seed);

  const zPadding = Math.max(bounds.ballRadius * 1.5, padMeters);
  const zLimit = Math.max(0, bounds.halfWidthZ - bounds.ballRadius - zPadding);
  const planeX =
    server === 'east'
      ? bounds.leftPaddleX + bounds.ballRadius
      : bounds.rightPaddleX - bounds.ballRadius;
  const distX = Math.abs(planeX); // distance from center to outgoing paddle plane
  const maxAngleRad = Math.atan2(zLimit, distX);
  const maxAngleDeg = (maxAngleRad * 180) / Math.PI;

  // Draw two independent uniforms for magnitude and sign. Increase range to 35%..95%
  const u = rng();
  const v = rng();
  const magFrac = 0.35 + 0.6 * u; // 0.35..0.95 of safe envelope
  const signed = v * 2 - 1; // [-1, 1]
  const deg = isFinite(maxAngleDeg) ? signed * maxAngleDeg * magFrac : 0;
  return deg;
}
