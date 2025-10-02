import type { GameState } from '../../model/state';
import { clampZ } from '../utils';
import type { FrameEvents } from '@pong/shared';

const MAX_TOI_ITERS = 4;

/**
 * Continuous collision detection step (TOI sweep) for the ball over dt.
 * Resolves the earliest among wall and paddle contacts, iterating while time remains.
 * Captures the first wall/paddle event of the frame for FX.
 */
export function stepBallTOIInPlace(
  s: GameState,
  ball: { x: number; z: number; vx: number; vz: number },
  dt: number,
  events: FrameEvents,
): void {
  let remaining = dt;

  // Constants
  const zMax = s.bounds.halfWidthZ - s.bounds.ballRadius;
  const clampMin = -zMax;
  const clampMax = +zMax;
  const halfDepth = s.bounds.paddleHalfDepthZ + s.bounds.ballRadius;
  const leftPlane = s.bounds.leftPaddleX + s.bounds.ballRadius;
  const rightPlane = s.bounds.rightPaddleX - s.bounds.ballRadius;

  // numerical guard
  const EPS = 1e-9;

  const timeTo = (target: number, current: number, v: number): number => {
    if (Math.abs(v) < EPS) return Number.POSITIVE_INFINITY;
    const t = (target - current) / v;
    return t > EPS ? t : Number.POSITIVE_INFINITY;
  };

  for (let iter = 0; iter < MAX_TOI_ITERS && remaining > 0; iter++) {
    const { x, z, vx, vz } = ball;

    // Candidate times
    const tNorth = timeTo(+zMax, z, vz);
    const tSouth = timeTo(-zMax, z, vz);
    const tLeft = timeTo(leftPlane, x, vx);
    const tRight = timeTo(rightPlane, x, vx);

    type Hit =
      | { kind: 'north' | 'south'; t: number }
      | { kind: 'left' | 'right'; t: number; zHit: number };

    const candidates: Hit[] = [];
    if (tNorth <= remaining) candidates.push({ kind: 'north', t: tNorth });
    if (tSouth <= remaining) candidates.push({ kind: 'south', t: tSouth });
    if (tLeft <= remaining) {
      const zHit = z + vz * tLeft;
      if (Math.abs(zHit - s.paddles.east.z) <= halfDepth) candidates.push({ kind: 'left', t: tLeft, zHit });
    }
    if (tRight <= remaining) {
      const zHit = z + vz * tRight;
      if (Math.abs(zHit - s.paddles.west.z) <= halfDepth) candidates.push({ kind: 'right', t: tRight, zHit });
    }

    // Choose earliest
    let hit: Hit | null = null;
    for (const c of candidates) if (!hit || c.t < hit.t) hit = c;

    if (!hit) {
      // No hit within remaining: advance freely and finish
      ball.x = x + vx * remaining;
      ball.z = z + vz * remaining;
      remaining = 0;
      break;
    }

    // Advance to contact
    const t = hit.t;
    const xHit = x + vx * t;
    let zHit = z + vz * t;

    if (hit.kind === 'north' || hit.kind === 'south') {
      const zWall = hit.kind === 'north' ? +zMax : -zMax;
      const vzIn = vz;
      zHit = clampZ(zWall, clampMin, clampMax);
      const vzOut = -vz * s.params.restitutionWall;
      ball.x = xHit;
      ball.z = zHit;
      ball.vx = vx;
      ball.vz = vzOut;
      if (!events.wallHit) {
        events.wallHit = { side: hit.kind === 'north' ? 'north' : 'south', x: xHit, z: zHit, vzAbs: Math.abs(vzIn) };
      }
    } else if (hit.kind === 'left' || hit.kind === 'right') {
      const plane = hit.kind === 'left' ? leftPlane : rightPlane;
      const paddleVz = hit.kind === 'left' ? s.paddles.east.vz : s.paddles.west.vz;
      const zClamped = clampZ(hit.zHit, clampMin, clampMax);
      const vxOut = -vx;
      const vzOut = vz + paddleVz * s.params.zEnglish;
      ball.x = plane;
      ball.z = zClamped;
      ball.vx = vxOut;
      ball.vz = vzOut;
      if (!events.paddleHit) {
        events.paddleHit = {
          side: hit.kind,
          x: plane,
          z: zClamped,
          vxAbs: Math.abs(vx),
          vzAbs: Math.abs(vz),
        } as FrameEvents['paddleHit'];
      }
    }

    remaining -= t;
  }
}
