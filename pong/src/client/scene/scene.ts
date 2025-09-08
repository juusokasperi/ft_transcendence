// src/client/scene/scene.ts
import { Scene } from "@babylonjs/core/scene";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";

import { addSpaceBackground } from "@client/scene/background";
import { setupLights } from "@client/scene/light/light";
import { createSunShadows } from "@client/scene/light/shadows";
import { setupCamera } from "@client/scene/camera/camera";
import { addTable, type TableHandle } from "@client/scene/mesh/table";
import { addPaddle, type PaddleHandle } from "@client/scene/mesh/paddle";
import { addBall, type BallHandle } from "@client/scene/mesh/ball";
import { addNet, type NetHandle } from "@client/scene/mesh/net";

import { Colors } from "./color";

export type WorldKit = {
  scene: Scene;
  camera: ArcRotateCamera;
  lights: { hemi: HemisphericLight; sun: DirectionalLight };
  shadows: ReturnType<typeof createSunShadows>;
  table: TableHandle;
  paddles: { left: PaddleHandle; right: PaddleHandle };
  ball: BallHandle;
  net: NetHandle;
  /** Idempotent cleanup for all owned resources. */
  dispose: () => void;
};

/**
 * Build the full Babylon “world”:
 * - scene, background
 * - camera, lights, shadow generator
 * - table, paddles, ball (with shadow casting / receiving wired)
 */
export function createWorld(engine: Engine): WorldKit {
  const scene = new Scene(engine);

  // Background
  const bg = addSpaceBackground(scene, {
    starColor: Colors.bg.star,
    backgroundColor: Colors.bg.space,
  });

  // Camera + lights
  const camera = setupCamera(scene);
  const lights = setupLights(scene); // {hemi, sun}

  // Meshes
  const table = addTable(scene);
  const left = addPaddle(scene, table, "left");
  const right = addPaddle(scene, table, "right");
  const ball = addBall(scene, table);
  const net = addNet(scene, table);

  // Shadows
  const shadows = createSunShadows(lights.sun);
  shadows.addCasters(ball.mesh, left.mesh, right.mesh);
  shadows.setReceives(table.tableTop, table.tableDepth);

  // ---- Single cleanup body (idempotent) -----------------------------------
  let freed = false;
  const freeOwnedResources = () => {
    if (freed) return;
    freed = true;
    try {
      shadows.sg.dispose();
    } catch {}
    try {
      net.dispose();
      ball.dispose();
      left.dispose();
      right.dispose();
      table.dispose();
    } catch {}
    try {
      bg.dispose();
    } catch {}
    // Note: camera/lights belong to the scene; letting scene.dispose() handle them.
  };

  // Auto-clean when the scene goes away
  scene.onDisposeObservable.add(freeOwnedResources);

  // World disposer triggers scene teardown (which calls freeOwnedResources)
  const dispose = () => {
    try {
      scene.dispose();
    } catch {}
  };

  return {
    scene,
    camera,
    lights,
    shadows,
    table,
    paddles: { left, right },
    ball,
    net,
    dispose,
  };
}
