// src/client/scene/mesh/paddle.ts
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Colors } from "@client/scene/color";
import { makeGlass } from "@client/scene/materials/glass";

export type PaddleHandle = {
  root: TransformNode;
  mesh: AbstractMesh;
  dispose: () => void;
};

export const PADDLE_SIZE = Object.freeze({
  width: 0.035,
  height: 0.15,
  depth: 0.3,
});
export const PADDLE_MARGIN = 0.006;

export function addPaddle(
  scene: Scene,
  table: { root: TransformNode; tableTop: AbstractMesh },
  side: "left" | "right",
): PaddleHandle {
  // Parent
  const root = new TransformNode(`paddleRoot:${side}`, scene);
  root.parent = table.root;

  // Mesh
  const mesh = MeshBuilder.CreateBox(
    `paddle:${side}`,
    { ...PADDLE_SIZE },
    scene,
  );
  mesh.parent = root;
  mesh.isPickable = false;

  // Glass material: subtle per-side tint (keeps team color coding)
  const tint =
    side === "left" ? Colors.paddleLeft.clone() : Colors.paddleRight.clone();

  const mat = makeGlass(scene, tint, {
    // Keep the same glass look but denser & more tinted:
    opacity: 0.9, // closer to 1 = more opaque
    tintDistance: 0.05, // lower = tint accumulates fast (denser color)
    thickness: 0.6, // higher = denser absorption
    tintStrength: 1.0, // >1 for extra saturation if you want
    refraction: 0.8, // a bit less see-through than 1.0
    roughness: 0.05, // slightly softer reflections
    ior: 1.5,
    clearCoat: 1.0,
    backFaceCulling: false,
  });

  mesh.material = mat;
  mat.freeze();

  // Place against inner edge with a margin; sit on top of the table
  const halfLenX = table.tableTop.getBoundingInfo().boundingBox.extendSize.x;
  const sign = side === "left" ? -1 : 1;
  mesh.position.set(
    sign * (halfLenX - PADDLE_MARGIN - PADDLE_SIZE.width / 2),
    table.tableTop.position.y + PADDLE_SIZE.height / 2,
    0,
  );

  const dispose = () => {
    mesh.dispose();
    mat.dispose();
    root.dispose();
  };

  return { root, mesh, dispose };
}
