/**
 * Compute the duration (in milliseconds) of a single simulation tick for
 * a given tick rate.
 *
 * For example, at 60 Hz this returns ~16.666... ms.
 */
export const gridMs = (tickHz: number): number => 1000 / tickHz;

/**
 * Quantize a pause duration in milliseconds onto the simulation tick grid.
 *
 * Why:
 *   - The game engine advances in fixed dt steps (1 / tickHz).
 *   - Pauses such as "time between points" should align to whole ticks so
 *     they behave consistently across clients and the server.
 *
 * Behavior:
 *   - Negative values are clamped to 0.
 *   - The result is rounded **up** to the next multiple of the tick duration
 *     so we never shorten a requested pause.
 */
export function quantizeMs(ms: number, tickHz: number): number {
  const grid = gridMs(tickHz);
  const clamped = Math.max(0, ms);
  return Math.ceil(clamped / grid) * grid;
}
