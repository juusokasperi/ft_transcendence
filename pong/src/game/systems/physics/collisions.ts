// src/game/systems/physics/collisions.ts
import type { GameState } from "@game/model/state";
import type { FrameEvents } from "@shared/protocol/events";
import { clampZ } from "@game/systems/utils";

export function collideWalls(
  s: GameState,
  dt: number,
): { s: GameState; wallHit?: FrameEvents["wallHit"] } {
  let { x, z, vx, vz } = s.ball;
  const vzIn = vz; // keep the incoming Z-speed for FX

  const nextZ = z + vz * dt;
  const zMax = s.bounds.halfWidthZ - s.bounds.ballRadius;

  let wallHit: FrameEvents["wallHit"] | undefined;

  if (nextZ > zMax && vz > 0) {
    const overshoot = nextZ - zMax;
    z = zMax - overshoot;
    vz = -vz * s.params.restitutionWall;
    wallHit = { side: "north", x, z, vzAbs: Math.abs(vzIn) };
  } else if (nextZ < -zMax && vz < 0) {
    const overshoot = -zMax - nextZ;
    z = -zMax + overshoot;
    vz = -vz * s.params.restitutionWall;
    wallHit = { side: "south", x, z, vzAbs: Math.abs(vzIn) };
  } else {
    z = nextZ;
  }

  return { s: { ...s, ball: { x, z, vx, vz } }, wallHit };
}

export function collidePaddle(s: GameState, dt: number): GameState {
  const { ball, paddles, bounds, params } = s;
  const { x, z, vx, vz } = ball;
  const nextX = x + vx * dt;

  const halfDepth = bounds.paddleHalfDepthZ + bounds.ballRadius / 2;
  const sides = [
    {
      plane: bounds.leftPaddleX + bounds.ballRadius,
      pz: paddles.P1.z,
      pvz: paddles.P1.vz,
    },
    {
      plane: bounds.rightPaddleX - bounds.ballRadius,
      pz: paddles.P2.z,
      pvz: paddles.P2.vz,
    },
  ] as const;

  for (const { plane, pz, pvz } of sides) {
    const denom = nextX - x;
    if (Math.abs(denom) < 1e-9) continue; // no horizontal travel
    if ((plane - x) * denom <= 0) continue; // not moving toward this plane

    const t = (plane - x) / denom; // fraction of dt
    if (t < 0 || t > 1) continue; // no hit within this step
    if (Math.abs(z - pz) > halfDepth) continue; // outside paddle depth

    const zHit = z + vz * dt * t;
    return {
      ...s,
      ball: {
        x: plane,
        z: clampZ(
          zHit,
          -(s.bounds.halfWidthZ - s.bounds.ballRadius),
          +(s.bounds.halfWidthZ - s.bounds.ballRadius),
        ),
        vx: -vx,
        vz: vz + pvz * params.zEnglish,
      },
    };
  }

  return s;
}
