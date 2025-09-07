// src/shared/index.ts
// Only cross-layer types/utilities. No DOM, no Babylon.
export type { TableEnd, WallSide } from "./domain/ids";
export { SERVE_SELECT_TOTAL_MS } from "./domain/timing";

export type { GameHistoryEntry } from "./protocol/state";
export type { FrameEvents } from "./protocol/events";
export type { InputIntent } from "./protocol/input";

export {
  xorshift32,
  XorShift32,
  deriveSeed32,
  pickInitialServer,
  type MatchSeed,
} from "./utils/random";

export { RafTicker, type RafTickFn } from "./utils/raf-ticker";
export { type Disposable } from "./utils/disposable";
export { default as Logger } from "./utils/logger";
