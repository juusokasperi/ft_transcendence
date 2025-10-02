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
