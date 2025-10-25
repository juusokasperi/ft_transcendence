import type { AbstractMesh, DomScoreboardAPI } from '@pong/render';
import { toggleControlsMirrored } from '@pong/render';
import { swapPaddleMaterials } from '../shared/utils';
import type { Preferences } from '../shared/preferences';
import { applyPreferences } from '../shared/preferences';
import { setHudAndPaletteColorsFromPrefs } from './utils';

export function applySideSwap(args: {
  left: AbstractMesh;
  right: AbstractMesh;
  hud: DomScoreboardAPI;
  preferences?: Preferences;
  rowsMirrored: boolean;
  setNames: (n: { east: string; west: string }) => void;
}): boolean {
  const { left, right, hud, preferences, rowsMirrored, setNames } = args;

  // Controls follow player identity across swaps
  toggleControlsMirrored();
  // Colors/skins follow players across sides
  swapPaddleMaterials(left, right);

  const nextRowsMirrored = !rowsMirrored;
  // Re‑apply preferences so player colors continue to follow players
  applyPreferences(preferences, {
    setNames,
    leftMaterial: left.material,
    rightMaterial: right.material,
    rowsMirrored: nextRowsMirrored,
  });
  if (preferences) setHudAndPaletteColorsFromPrefs(hud, preferences, nextRowsMirrored);

  return nextRowsMirrored;
}
