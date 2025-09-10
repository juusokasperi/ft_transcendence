// src/shared/protocol/events.ts
import type { WallSide } from "@shared/domain/ids";

export type FrameEvents = {
  /** Wall contact point and incoming Z-speed magnitude (for FX only). */
  wallHit?: { side: WallSide; x: number; z: number; vzAbs: number };
  explode?: { x: number; z: number };
};
