// src/game/index.ts
// Narrow surface for the deterministic core (no Babylon imports here)
export type { GameState } from "./model/state";

export { createInitialState } from "./model/state";
export { stepPaddles } from "./systems/control/paddle";
export { handleSteps } from "./systems/flow/phases";
export { serveFrom } from "./systems/flow/service";

export { createMatchController } from "./match/controller";
export { tableTennisRules } from "./rules/presets";
