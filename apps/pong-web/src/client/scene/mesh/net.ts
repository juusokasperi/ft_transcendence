// src/client/scene/mesh/net.ts
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Colors } from "@client/scene/color";
import { makeGlass } from "@client/scene/materials/glass";

export type NetHandle = {
  root: TransformNode;
  mesh: AbstractMesh;
  dispose: () => void;
};

type TableRef = { root: TransformNode; tableTop: AbstractMesh };

/**
 * Add a centered glass net with rounded corners.
 * Uses ExtrudeShape to create a rounded-rectangle prism (thin slab).
 */
export function addNet(
  scene: Scene,
  table: TableRef,
  opts?: {
    height?: number; // meters (official TT net ~0.1525)
    thickness?: number; // extrusion along X (meters)
    cornerRadius?: number; // rounded corner radius (meters)
    cornerSteps?: number; // arc tessellation per corner
  },
): NetHandle {
  const {
    height = 0.1525,
    thickness = 0.015,
    cornerRadius = 0.03,
    cornerSteps = 8,
  } = opts ?? {};

  // Derive table metrics
  const tableBB = table.tableTop.getBoundingInfo().boundingBox;
  const tableSurfaceY =
    table.tableTop.position.y + tableBB.extendSize.y + 0.002; // top surface
  const tableWidthZ = tableBB.extendSize.z * 2; // total Z span

  // Net spans across Z with a small inset
  const netWidth = Math.max(0.01, tableWidthZ);
  const radius = Math.min(cornerRadius, 0.5 * Math.min(netWidth, height));

  // Build a 2D rounded-rectangle profile in the XY plane (Z=0), then extrude along X.
  const shape = roundedRectShape(netWidth, height, radius, cornerSteps);

  // Path: thin extrusion along X (centered on X=0 so it sits neatly on table center line)
  const path = [
    new Vector3(-thickness / 2, 0, 0),
    new Vector3(thickness / 2, 0, 0),
  ];

  const root = new TransformNode("net-root", scene);
  root.parent = table.root;

  const mesh = MeshBuilder.ExtrudeShape(
    "net-glass",
    { shape, path, cap: Mesh.CAP_ALL, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  mesh.parent = root;
  mesh.isPickable = false;

  // Glass material with a subtle cyan tint (matches table vibe)
  const tint = Colors.tableNet.clone().scale(0.8);
  const mat = makeGlass(scene, tint, {
    // Make it visibly glass, slightly tinted/denser than paddles
    opacity: 0.2, // toward 1 = more opaque
    tintDistance: 0.2, // lower = tint accumulates faster
    thickness: 0.08, // optical thickness for absorption
    tintStrength: 1.0,
    refraction: 0.8, // a bit less see-through than 1.0
    roughness: 0.045, // soften reflections a touch
    ior: 1.5,
    clearCoat: 1.0,
    backFaceCulling: false,
  });
  mesh.material = mat;
  mat.freeze();

  // Position: centered on X=0 & Z=0, hovering over the table surface
  mesh.position.set(0, tableSurfaceY + 0.01 + height / 2, 0);

  const dispose = () => {
    mesh.dispose();
    mat.dispose();
    root.dispose();
  };

  return { root, mesh, dispose };
}

/** Produce a closed polyline of a rounded rectangle in the XY plane (Z=0). */
function roundedRectShape(
  width: number,
  height: number,
  r: number,
  stepsPerCorner = 8,
): Vector3[] {
  const w2 = width / 2;
  const h2 = height / 2;
  const rClamped = Math.min(r, w2, h2);
  const pts: Vector3[] = [];

  // Helper to push arc points (inclusive) from startAngle to endAngle (radians)
  const arc = (cx: number, cy: number, start: number, end: number) => {
    const steps = Math.max(1, stepsPerCorner);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = start + (end - start) * t;
      pts.push(
        new Vector3(
          cx + rClamped * Math.cos(a),
          cy + rClamped * Math.sin(a),
          0,
        ),
      );
    }
  };

  // Go CCW starting from right-middle corner arc to ensure no self-intersections
  // Bottom-right arc (−π/2 → 0)
  arc(w2 - rClamped, -h2 + rClamped, -Math.PI / 2, 0);
  // Top-right arc (0 → π/2)
  arc(w2 - rClamped, h2 - rClamped, 0, Math.PI / 2);
  // Top-left arc (π/2 → π)
  arc(-w2 + rClamped, h2 - rClamped, Math.PI / 2, Math.PI);
  // Bottom-left arc (π → 3π/2)
  arc(-w2 + rClamped, -h2 + rClamped, Math.PI, (3 * Math.PI) / 2);

  // Ensure closure (first and last identical)
  pts.push(pts[0].clone());
  return pts;
}
