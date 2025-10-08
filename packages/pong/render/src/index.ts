// packages/pong/render/src/index.ts

// ── Engine lifecycle ───────────────────────────────────────────────────────────
export { createEngine } from './client/engine/engine';
export { createLifecycle } from './client/engine/lifecycle';
export { disposeWorld } from './client/engine/teardown';

// ── World / Scene ──────────────────────────────────────────────────────────────
export { createWorld } from './client/scene/scene';
export { setPaddleColors } from './client/scene/color';
export { orbitCameraFor } from './client/scene/camera/camera';

// ── Input ─────────────────────────────────────────────────────────────────────
export {
  attachLocalInput,
  readIntent,
  setControlsMirrored,
  toggleControlsMirrored,
  blockInputFor,
  setBindingProfile,
  overrideBindings,
} from './client/input/aggregate';

// ── FX / Visuals ───────────────────────────────────────────────────────────────
export { createBounces } from './client/visuals/bounce/bounces';
export { FXManager } from './client/fx/manager';
export { createPaddleAnimator } from './client/visuals/animate-paddle';
export type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

// ── UI / HUD ──────────────────────────────────────────────────────────────────
export { createScoreboard } from './client/ui/scoreboard';
export { updateHUD } from './client/ui/hud-binding';
export type { DomScoreboardAPI } from './client/ui/scoreboard';
export { createVolumeUI } from './client/ui/volume';
export type { MatchSnapshot } from '@pong/shared';

// ── App adapters / mappers ────────────────────────────────────────────────────
export { computeBounds } from './app/bounds';
export { detectEnteredServe, onEnteredServe } from './app/serve-cue';
export { applyFrameEventsToFx } from './app/events-to-fx';
export { mapStateForPlayerRows, mapHistoryForPlayers } from './app/hud-map';

export { decHide, incHide } from './client/fx/utils';
export type { PlayerSeat, mixOnlineAxes } from './app/seat-router';

// ── Audio ─────────────────────────────────────────────────────────────────────
export { createAudioManager } from './client/audio/manager';
export { createAudioBus } from './client/audio/commands';
export type { AudioCommand, AudioCommandBus } from './client/audio/commands';
export { DefaultAudioManifest } from './client/audio/manifest';
export { unlockOnInteraction, resumeAudioContext } from './client/audio/loader';
export { applyFrameEventsToAudio } from './app/events-to-audio';
export type { Scene } from '@babylonjs/core/scene';
