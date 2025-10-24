import type { AbstractMesh } from '@pong/render';
import { swapPaddleMaterials } from '../shared/utils';

/**
 * Swap paddle materials and toggle HUD mirroring, returning new mirror parity.
 * Online mode does not mirror local controls, only HUD rows/colors follow players.
 */
export function applyOnlineSideSwap(
  left: AbstractMesh,
  right: AbstractMesh,
  rowsMirrored: boolean,
): boolean {
  swapPaddleMaterials(left, right);
  return !rowsMirrored;
}
