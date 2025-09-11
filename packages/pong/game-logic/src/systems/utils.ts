import type { GameState } from '../model/state';

export function clampZ(z: number, min: number, max: number): number {
  if (z < min) return min;
  if (z > max) return max;
  return z;
}

export function isServePhase(p: GameState['phase']): boolean {
  return p === 'serveEast' || p === 'serveWest';
}

export function isPauseBtwPoints(p: GameState['phase']): p is 'pauseBtwPoints' {
  return p === 'pauseBtwPoints';
}

export function isRallyPhase(p: GameState['phase']): p is 'rally' {
  return p === 'rally';
}
