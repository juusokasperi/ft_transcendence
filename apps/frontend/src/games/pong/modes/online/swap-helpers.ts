import type { AbstractMesh } from '@pong/render';

/**
 * Toggle HUD mirroring, returning new mirror parity.
 * Online mode does not mirror local controls; paddle colors are bound to
 * seats in create-online.ts based on playerAtEnd.
 */
export function applyOnlineSideSwap(
  _left: AbstractMesh,
  _right: AbstractMesh,
  rowsMirrored: boolean,
): boolean {
  return !rowsMirrored;
}
