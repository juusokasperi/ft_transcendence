export const gridMs = (tickHz: number): number => 1000 / tickHz;

export function quantizeMs(ms: number, tickHz: number): number {
  const grid = gridMs(tickHz);
  const clamped = Math.max(0, ms);
  return Math.ceil(clamped / grid) * grid;
}
