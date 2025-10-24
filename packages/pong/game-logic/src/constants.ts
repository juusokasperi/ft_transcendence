export const MS_PER_S = 1000;

/** Short pause after each rally. */
export const PAUSE_BETWEEN_POINTS_MS = 600;

/**
 * Longer pause to show the game result before next game boots.
 *
 * Match the camera-rotation + HUD message duration used by clients so that
 * the first serve of the next game reliably starts after the rotation ends.
 */
export const PAUSE_BETWEEN_GAMES_MS = 3200;

/** Pause during mid-swap animations. */
export const MIDSWAP_PAUSE_MS = 3200;

/** Optional “victory” pause at match end. */
export const PAUSE_MATCH_OVER_MS = 2500;
