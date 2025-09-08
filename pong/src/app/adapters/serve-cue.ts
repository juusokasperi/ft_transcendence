// src/app/adapters/serve-cue.ts
import type { Phase } from "@game/model/state";
import { decHide } from "@client/fx/utils";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

type Entered = "east" | "west" | null;
type ReturnTypeCreateBounces = {
  scheduleServe: (dir: -1 | 1) => void;
  update: (x: number, vx: number) => number;
  clear: () => void;
};

export function detectEnteredServe(prev: Phase, next: Phase): Entered {
  const isServe = (p: Phase) => p === "serveEast" || p === "serveWest";
  if (isServe(next) && !isServe(prev)) {
    return next === "serveEast" ? "east" : "west";
  }
  return null;
}

/** Perform the render-side cues when we enter a serve phase. */
export function onEnteredServe(
  who: "east" | "west",
  deps: {
    ballMesh: AbstractMesh;
    Bounces: ReturnTypeCreateBounces;
    paddleAnim: { cue: (ms?: number) => number };
    blockInputFor: (ms: number) => void;
  },
) {
  const dir = who === "east" ? -1 : 1;
  decHide(deps.ballMesh);
  deps.Bounces.scheduleServe(dir);
  const blocked = deps.paddleAnim.cue(220);
  deps.blockInputFor(blocked);
}
