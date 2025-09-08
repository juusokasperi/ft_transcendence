// src/client/scene/mesh/ball.ts
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Colors } from "@client/scene/color";

export type BallHandle = {
  root: TransformNode;
  mesh: AbstractMesh;
  dispose: () => void;
};

export function addBall(
  scene: Scene,
  table: { root: TransformNode; tableTop: AbstractMesh },
): BallHandle {
  const radius = 0.03;

  const root = new TransformNode("ball-root", scene);
  root.parent = table.root;

  // Spawn safely under the table; visuals/bounces will position it for serves.
  const y = table.tableTop.position.y - 30;

  const mesh = MeshBuilder.CreateSphere(
    "ball",
    { diameter: radius * 2, segments: 16 },
    scene,
  );
  mesh.parent = root;
  mesh.position.set(0, y, 0);
  mesh.isPickable = false;

  const mat = new StandardMaterial("ball-mat", scene);
  mat.specularColor = Colors.material.specularNone;
  mat.diffuseColor = Colors.ball.clone();
  mesh.material = mat;

  const dispose = () => {
    mesh.dispose();
    mat.dispose();
    root.dispose();
  };

  return { root, mesh, dispose };
}
