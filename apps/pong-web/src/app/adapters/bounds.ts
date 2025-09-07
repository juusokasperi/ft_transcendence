// src/app/adapters/bounds.ts
import type { WorldKit } from "@client/scene/scene";
import type { GameState } from "@game/model/state";

/** Read Babylon geometry once and derive headless bounds. */
export function computeBounds(world: WorldKit): {
  bounds: GameState["bounds"];
} {
  const {
    table,
    paddles: { left, right },
    ball,
  } = world;

  // Ensure world matrices & bounding info are up to date (no-arg variant)
  table.tableTop.computeWorldMatrix(true);
  left.mesh.computeWorldMatrix(true);
  right.mesh.computeWorldMatrix(true);
  ball.mesh.computeWorldMatrix(true);

  const tableBB = table.tableTop.getBoundingInfo().boundingBox;
  const halfLengthX = tableBB.extendSizeWorld.x;
  const halfWidthZ = tableBB.extendSizeWorld.z;

  const leftBB = left.mesh.getBoundingInfo().boundingBox;
  const paddleHalfDepthZ = leftBB.extendSizeWorld.z;

  const ballBI = ball.mesh.getBoundingInfo();
  const ballRadius = ballBI.boundingSphere.radiusWorld;

  const leftPaddleX = left.mesh.getBoundingInfo().boundingBox.centerWorld.x;
  const rightPaddleX = right.mesh.getBoundingInfo().boundingBox.centerWorld.x;

  const bounds: GameState["bounds"] = {
    halfLengthX,
    halfWidthZ,
    paddleHalfDepthZ,
    leftPaddleX,
    rightPaddleX,
    ballRadius,
  };

  return { bounds };
}
