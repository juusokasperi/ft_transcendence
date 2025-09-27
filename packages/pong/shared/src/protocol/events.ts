import type { WallSide } from '../domain/ids';

export type FrameEvents = {
  /** Wall contact point and incoming Z-speed magnitude (for FX only). */
  wallHit?: {
    side: WallSide;
    x: number;
    z: number;
    vzAbs: number;
  };
  /** Paddle collision (deterministic), includes side and contact point. */
  paddleHit?: {
    side: 'left' | 'right';
    x: number;
    z: number;
    vxAbs: number;
    vzAbs: number;
  };
  explode?: {
    x: number;
    z: number;
  };
};
