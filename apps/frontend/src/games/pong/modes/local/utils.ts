import type { DomScoreboardAPI } from '@pong/render';
import { setPaddleColors, mapHistoryForPlayers } from '@pong/render';
import type { Preferences } from '../preferences';
import { hexToRgb, rgb01ToCss } from '../preferences';
import type { AbstractMesh } from '@pong/render';
import type { GameState } from '@pong/game-logic';
import type { MatchSnapshot, TableEnd } from '@pong/shared';
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
 * Show a HUD message and block input; returns the timestamp until which
 * gameplay should be paused (performance.now() based).
 */
export function announceAndPause(
  hud: DomScoreboardAPI,
  text: string,
  ms: number,
  blockInputFor: (ms: number) => void,
): number {
  const dur = Math.max(0, ms | 0);
  hud.flashMessage(text, dur);
  blockInputFor(dur);
  return performance.now() + dur;
}

/** Swap paddle materials so colors/skins follow players across sides. */
export function swapPaddleMaterials(left: AbstractMesh, right: AbstractMesh): void {
  const m = left.material;
  left.material = right.material;
  right.material = m;
}

/** Handle match-over UX: message + host event dispatch. */
export function handleMatchOver(
  hud: DomScoreboardAPI,
  names: { east: string; west: string },
  winner: TableEnd,
  getSnapshot: () => MatchSnapshot,
  canvas: HTMLCanvasElement,
  messageMs = 3800,
): void {
  // Map winner via last game's history (player-pinned rows) to avoid end/row mismatch
  const snap = getSnapshot();
  const historyForHUD = mapHistoryForPlayers(snap.gamesHistory);
  const last = historyForHUD[historyForHUD.length - 1];
  const winnerRow = (last?.winner ?? winner) as TableEnd; // fallback to end if history missing
  hud.flashMessage(`${names[winnerRow]} won, impressive match!`, messageMs);
  canvas.dispatchEvent(
    new CustomEvent('pong:matchOver', {
      detail: { winner, bestOf: snap.bestOf, gamesHistory: historyForHUD, names },
    }),
  );
}

/** Show swap message (mid-game or between-games). Returns pause-until timestamp. */
export function handleSwapSidesNow(
  hud: DomScoreboardAPI,
  prevPhase: GameState['phase'],
  getSnapshot: () => MatchSnapshot,
  names: { east: string; west: string },
  blockInputForFn: (ms: number) => void,
  messageMs = 3200,
): number {
  const isMidGame = prevPhase === 'rally';
  if (isMidGame) {
    return announceAndPause(hud, 'Swapping mid-game for decisive game', messageMs, blockInputForFn);
  }

  const snap = getSnapshot();
  const hist = snap.gamesHistory || [];
  const last = hist[hist.length - 1];
  if (last?.winner) {
    const winnerRow = last.winner as TableEnd;
    return announceAndPause(
      hud,
      `${names[winnerRow]} won the game, swapping side!`,
      messageMs,
      blockInputForFn,
    );
  }
  return 0;
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
  const magFrac = 0.35 + 0.60 * u; // 0.35..0.95 of safe envelope
  const signed = v * 2 - 1; // [-1, 1]
  const deg = isFinite(maxAngleDeg) ? signed * maxAngleDeg * magFrac : 0;
  return deg;
}
