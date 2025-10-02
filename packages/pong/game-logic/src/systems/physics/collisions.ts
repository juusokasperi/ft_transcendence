import type { GameState } from '../../model/state';
import { clampZ } from '../utils';
import type { FrameEvents } from '@pong/shared';

export function collideWalls(
  s: GameState,
  dt: number,
): { s: GameState; wallHit?: FrameEvents['wallHit'] } {
  let { x, z, vx, vz } = s.ball;
  const vzIn = vz; // keep the incoming Z-speed for FX

  const nextZ = z + vz * dt;
  const zMax = s.bounds.halfWidthZ - s.bounds.ballRadius;

  let wallHit: FrameEvents['wallHit'] | undefined;

  if (nextZ > zMax && vz > 0) {
    const overshoot = nextZ - zMax;
    z = zMax - overshoot;
    vz = -vz * s.params.restitutionWall;
    wallHit = { side: 'north', x, z, vzAbs: Math.abs(vzIn) };
  } else if (nextZ < -zMax && vz < 0) {
    const overshoot = -zMax - nextZ;
    z = -zMax + overshoot;
    vz = -vz * s.params.restitutionWall;
    wallHit = { side: 'south', x, z, vzAbs: Math.abs(vzIn) };
  } else {
    z = nextZ;
  }

  return { s: { ...s, ball: { x, z, vx, vz } }, wallHit };
}

export function collidePaddle(
  s: GameState,
  dt: number,
): {
  s: GameState;
  paddleHit?: { side: 'left' | 'right'; x: number; z: number; vxAbs: number; vzAbs: number };
} {
  const { ball, paddles, bounds, params } = s;
  const { x, z, vx, vz } = ball;
  const nextX = x + vx * dt;

  // Expand paddle hitbox along Z by a full ball radius
  const halfDepth = bounds.paddleHalfDepthZ + bounds.ballRadius;
  const clampMin = -(bounds.halfWidthZ - bounds.ballRadius);
  const clampMax = +(bounds.halfWidthZ - bounds.ballRadius);
  const denom = nextX - x;
  if (Math.abs(denom) < 1e-9) return { s }; // no horizontal travel

  // Check collision with left paddle plane (east)
  {
    const plane = bounds.leftPaddleX + bounds.ballRadius;
    if ((plane - x) * denom > 0) {
      const t = (plane - x) / denom;
      if (t >= 0 && t <= 1) {
        const zHit = z + vz * dt * t;
        if (Math.abs(zHit - paddles.east.z) <= halfDepth) {
          return {
            s: {
              ...s,
              ball: {
                x: plane,
                z: clampZ(zHit, clampMin, clampMax),
                vx: -vx,
                vz: vz + paddles.east.vz * params.zEnglish,
            },
          },
            paddleHit: {
              side: 'left',
              x: plane,
              z: clampZ(zHit, clampMin, clampMax),
              vxAbs: Math.abs(vx),
              vzAbs: Math.abs(vz),
            },
          };
        }
      }
    }
  }

  // Check collision with right paddle plane (west)
  {
    const plane = bounds.rightPaddleX - bounds.ballRadius;
    if ((plane - x) * denom > 0) {
      const t = (plane - x) / denom;
      if (t >= 0 && t <= 1) {
        const zHit = z + vz * dt * t;
        if (Math.abs(zHit - paddles.west.z) <= halfDepth) {
          return {
            s: {
              ...s,
              ball: {
                x: plane,
                z: clampZ(zHit, clampMin, clampMax),
                vx: -vx,
                vz: vz + paddles.west.vz * params.zEnglish,
            },
          },
            paddleHit: {
              side: 'right',
              x: plane,
              z: clampZ(zHit, clampMin, clampMax),
              vxAbs: Math.abs(vx),
              vzAbs: Math.abs(vz),
            },
          };
        }
      }
    }
  }

  return { s };
}

/**
 * Continuous collision detection step (TOI sweep) for the ball over dt.
 * Resolves the earliest among wall and paddle contacts, iterating while time remains.
 * Captures the first wall/paddle event of the frame for FX.
 */
export function stepBallTOI(
  s: GameState,
  dt: number,
): { s: GameState; events: FrameEvents } {
  let state = s;
  let remaining = dt;
  const events: FrameEvents = {};

  // Constants
  const zMax = state.bounds.halfWidthZ - state.bounds.ballRadius;
  const clampMin = -zMax;
  const clampMax = +zMax;
  const halfDepth = state.bounds.paddleHalfDepthZ + state.bounds.ballRadius;
  const leftPlane = state.bounds.leftPaddleX + state.bounds.ballRadius;
  const rightPlane = state.bounds.rightPaddleX - state.bounds.ballRadius;

  // numerical guard
  const EPS = 1e-9;

  const timeTo = (target: number, current: number, v: number): number => {
    if (Math.abs(v) < EPS) return Number.POSITIVE_INFINITY;
    const t = (target - current) / v;
    return t > EPS ? t : Number.POSITIVE_INFINITY;
  };

  // Limit the number of iterations to avoid pathological loops
  for (let iter = 0; iter < 4 && remaining > 0; iter++) {
    const { x, z, vx, vz } = state.ball;

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
      if (Math.abs(zHit - state.paddles.east.z) <= halfDepth) candidates.push({ kind: 'left', t: tLeft, zHit });
    }
    if (tRight <= remaining) {
      const zHit = z + vz * tRight;
      if (Math.abs(zHit - state.paddles.west.z) <= halfDepth) candidates.push({ kind: 'right', t: tRight, zHit });
    }

    // Choose earliest
    let hit: Hit | null = null;
    for (const c of candidates) if (!hit || c.t < hit.t) hit = c;

    if (!hit) {
      // No hit within remaining: advance freely and finish
      state = { ...state, ball: { x: x + vx * remaining, z: z + vz * remaining, vx, vz } };
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
      // reflect Z and set at contact, clamp to valid range
      zHit = clampZ(zWall, clampMin, clampMax);
      const vzOut = -vz * state.params.restitutionWall;
      state = { ...state, ball: { x: xHit, z: zHit, vx, vz: vzOut } };
      if (!events.wallHit) {
        events.wallHit = { side: hit.kind === 'north' ? 'north' : 'south', x: xHit, z: zHit, vzAbs: Math.abs(vzIn) };
      }
    } else if (hit.kind === 'left' || hit.kind === 'right') {
      // reflect X and apply english on Z; clamp z contact
      const plane = hit.kind === 'left' ? leftPlane : rightPlane;
      const paddleVz = hit.kind === 'left' ? state.paddles.east.vz : state.paddles.west.vz;
      const zClamped = clampZ(hit.zHit, clampMin, clampMax);
      const vxOut = -vx;
      const vzOut = vz + paddleVz * state.params.zEnglish;
      state = { ...state, ball: { x: plane, z: zClamped, vx: vxOut, vz: vzOut } };
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

  return { s: state, events };
}
