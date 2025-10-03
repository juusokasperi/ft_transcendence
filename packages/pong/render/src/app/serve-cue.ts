import type { Phase } from '@pong/game-logic';
import { decHide } from '../client/fx/utils';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

type Entered = 'east' | 'west' | null;
type ReturnTypeCreateBounces = {
  scheduleServe: (dir: -1 | 1) => void;
  update: (x: number, vx: number) => number;
  clear: () => void;
};

export function detectEnteredServe(prev: Phase, next: Phase): Entered {
  const isServe = (p: Phase) => p === 'serveEast' || p === 'serveWest';
  if (isServe(next) && !isServe(prev)) {
    return next === 'serveEast' ? 'east' : 'west';
  }
  return null;
}

/** Perform the render-side cues when we enter a serve phase. */
export function onEnteredServe(
  who: 'east' | 'west',
  deps: {
    ballMesh: AbstractMesh;
    Bounces: ReturnTypeCreateBounces;
    paddleAnim: { cue: (ms?: number) => number };
    blockInputFor: (ms: number) => void;
  },
) {
  const dir = who === 'east' ? -1 : 1;
  // Ensure we schedule the visual serve path before revealing the ball so it
  // always appears to lift off from the table, not mid-air.
  deps.Bounces.scheduleServe(dir);
  // Reveal on the next animation frame to give the scene a beat to apply the
  // new pose before showing the mesh.
  try {
    requestAnimationFrame(() => decHide(deps.ballMesh));
  } catch {
    // Fallback when rAF is unavailable
    setTimeout(() => decHide(deps.ballMesh), 0);
  }
  const blocked = deps.paddleAnim.cue(220);
  deps.blockInputFor(blocked);
}
