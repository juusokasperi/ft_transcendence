// src/client/visuals/bounce/bounces.ts
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { deriveSeed32, xorshift32 } from "@shared/utils/random";
import { clamp01, quadBezierY } from "@client/visuals/bounce/math";
import { aimYWithFraction } from "@client/visuals/bounce/aim-paddle";

type Sign = -1 | 1;

type Segment = {
  startX: number;
  targetX: number;
  y0: number;
  y1: number;
  peakOffset: number;
  type: "arc" | "linear";
  side?: "left" | "right";
  aimFrac?: number;
};

export function createBounces(
  ballMesh: AbstractMesh,
  tableTopY: number,
  ballRadius: number,
  halfLengthX: number,
  leftPaddle: AbstractMesh,
  rightPaddle: AbstractMesh,
  matchSeed: number,
) {
  const baseY = tableTopY + ballRadius / 2;
  const paddleHeight = leftPaddle.getBoundingInfo().boundingBox.extendSize.y;

  const BASE_LAND = 0.6;
  const JITTER_RANGE = 1.0;
  const MIN_LAND = 0.4;
  const MAX_LAND = 0.75;

  const MIN_AIM = 0.6;
  const MAX_AIM = 0.9;

  const MIN_ARC = 0.3;
  const MAX_ARC = 0.5;

  // absolute goal-line x (positive magnitude); left goal is -goalX, right is +goalX
  const goalX = halfLengthX + ballRadius;

  const seed = deriveSeed32((halfLengthX * 1000) | 0, matchSeed >>> 0);
  const rand01 = xorshift32(seed);

  const nextLandFraction = (): number => {
    const offset = (rand01() - 0.5) * JITTER_RANGE;
    const f = BASE_LAND + offset;
    return f < MIN_LAND ? MIN_LAND : f > MAX_LAND ? MAX_LAND : f;
  };

  const nextAimFraction = (): number =>
    MIN_AIM + rand01() * (MAX_AIM - MIN_AIM);
  const nextArcHeight = (): number => MIN_ARC + rand01() * (MAX_ARC - MIN_ARC);

  const clampX = (x: number) =>
    Math.max(-halfLengthX, Math.min(halfLengthX, x));

  const side = {
    left: {
      paddle: leftPaddle,
      planeX: () => leftPaddle.position.x + ballRadius,
    },
    right: {
      paddle: rightPaddle,
      planeX: () => rightPaddle.position.x - ballRadius,
    },
  } as const;

  const queue: Segment[] = [];
  const clear = () => void (queue.length = 0);
  const push = (s: Segment) => void queue.push(s);

  // remembers the point where we aimed at the paddle plane
  let pendingArcStart!: { x: number; y: number };

  // remembers the slope (dy/dx) of the last linear approach to the paddle plane
  let lastApproachSlope = 0;

  // Latches the visual freeze Y for the “miss to goal” case
  let freezeY: number = baseY;

  // ---- helpers to schedule segments -------------------------------------------------

  const scheduleArcToLand = (
    dir: Sign,
    startX: number,
    startY: number,
  ): number | null => {
    const landX = clampX(dir * (nextLandFraction() * halfLengthX));
    const forward = dir > 0 ? landX > startX : landX < startX;
    if (!forward) return null;

    const arcHeight = nextArcHeight();
    push({
      startX,
      targetX: landX,
      y0: startY,
      y1: baseY,
      peakOffset: arcHeight,
      type: "arc",
    });
    return landX;
  };

  const scheduleLinearToPaddle = (dir: Sign, fromX: number) => {
    const targetSide = dir > 0 ? "right" : "left";
    const s = side[targetSide];
    const plane = s.planeX();

    const forward = dir > 0 ? plane > fromX : plane < fromX;
    if (!forward) return;

    const aimFrac = nextAimFraction();
    const y1 = aimYWithFraction(s.paddle, aimFrac, paddleHeight);

    // slope of approach from baseY at fromX to y1 at plane
    const dx = plane - fromX;
    lastApproachSlope = dx !== 0 ? (y1 - baseY) / dx : 0;

    push({
      startX: fromX,
      targetX: plane,
      y0: baseY,
      y1,
      peakOffset: 0,
      type: "linear",
      side: targetSide,
      aimFrac,
    });

    pendingArcStart = { x: plane, y: y1 };
  };

  // When paddle is missed: extend line from paddle plane to goal line, preserving slope
  const scheduleMissExtensionToFreeze = (dir: Sign) => {
    const startX = pendingArcStart.x;
    const startY = pendingArcStart.y;
    const targetX = dir > 0 ? +goalX : -goalX;

    // Only if we're still moving forward (no flip yet)
    const forward = dir > 0 ? targetX > startX : targetX < startX;
    if (!forward) return;

    const dx = targetX - startX;
    const targetY = startY + lastApproachSlope * dx;

    // Remember where we want to visually freeze
    freezeY = targetY;

    push({
      startX,
      targetX,
      y0: startY,
      y1: targetY,
      peakOffset: 0,
      type: "linear",
    });
  };

  const scheduleServe = (dir: Sign) => {
    clear(); // reset on new rally
    ballMesh.position.x = 0;
    ballMesh.position.y = baseY;

    const landX = scheduleArcToLand(dir, 0, baseY);
    if (landX != null) scheduleLinearToPaddle(dir, landX);

    lastVXSign = dir;
  };

  const schedulePair = (dir: Sign) => {
    clear(); // reset on real bounce
    const startX = pendingArcStart.x;
    const startY = pendingArcStart.y;
    const landX = scheduleArcToLand(dir, startX, startY);
    if (landX != null) scheduleLinearToPaddle(dir, landX);
  };

  let lastVXSign: Sign = 1;

  // ----------------------------- per-frame update ------------------------------------
  const update = (currentX: number, currentVX: number): number => {
    if (!queue.length) {
      return freezeY;
    }
    // 1) If ball is at or beyond the goal line, prefer the latched miss-end Y.
    if (Math.abs(currentX) >= goalX) {
      clear();
      return freezeY;
    }

    // 2) Detect real bounce (vx sign flip) — headless flips at hit time.
    const sign: Sign = currentVX >= 0 ? 1 : -1;
    if (sign !== lastVXSign) {
      schedulePair(sign); // plan next land→paddle pair from the plane point
      lastVXSign = sign;
    }

    // 4) Keep approach aim live with paddle motion (for the current segment).
    const seg = queue[0];
    if (seg.type === "linear" && seg.side) {
      const p = (seg.side === "left" ? side.left : side.right).paddle;
      seg.y1 = aimYWithFraction(p, seg.aimFrac!, paddleHeight);
    }

    // 5) Integrate current segment.
    const span = seg.targetX - seg.startX;
    const reached =
      (span > 0 && currentX >= seg.targetX) ||
      (span < 0 && currentX <= seg.targetX);

    const u = reached ? 1 : clamp01((currentX - seg.startX) / (span || 1));

    let yNow: number;
    if (u <= 0) {
      yNow = seg.y0;
    } else if (u >= 1) {
      yNow = seg.y1;
      const finished = queue.shift();

      // 6) MISS handling…
      if (
        finished &&
        finished.type === "linear" &&
        finished.side &&
        queue.length === 0 &&
        sign === lastVXSign
      ) {
        const dxFinal = finished.targetX - finished.startX;
        if (dxFinal !== 0) {
          lastApproachSlope = (finished.y1 - finished.y0) / dxFinal;
        }

        const alreadyAtOrBeyondGoal = Math.abs(currentX) >= goalX;
        if (alreadyAtOrBeyondGoal) {
          const startX = pendingArcStart.x;
          const startY = pendingArcStart.y;
          const targetX = sign > 0 ? +goalX : -goalX;
          freezeY = startY + lastApproachSlope * (targetX - startX);
        } else {
          scheduleMissExtensionToFreeze(sign);
        }
      }
    } else {
      yNow =
        seg.type === "arc"
          ? quadBezierY(u, seg.y0, seg.y1, seg.peakOffset)
          : seg.y0 + (seg.y1 - seg.y0) * u;
    }

    return yNow;
  };

  return { scheduleServe, update, clear };
}
