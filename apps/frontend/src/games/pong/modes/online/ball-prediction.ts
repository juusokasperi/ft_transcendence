import type { GameState } from '@pong/game-logic';

type BallKinematics = {
  x: number;
  z: number;
  vx: number;
  vz: number;
};

type BallPredictorState = {
  hasBaseline: boolean;
  ball: BallKinematics;
  maxZ: number;
  restitutionWall: number;
};

export type BallPredictionConfig = {
  halfWidthZ: number;
  ballRadius: number;
};

export type BallPrediction = {
  /** Reset internal state when a new match or seat context starts. */
  reset(): void;
  /** Update baseline from the latest authoritative server state. */
  handleServerState(state: GameState): void;
  /**
   * Advance predicted ball state using latest velocity and a simple
   * wall-collision model over dtSec seconds. Returns the predicted
   * kinematics, or null if no baseline is available yet.
   */
  predict(dtSec: number): BallKinematics | null;
  /** Get the latest predicted kinematics without advancing time. */
  getPredictedBall(): BallKinematics | null;
};

export function createBallPrediction(cfg: BallPredictionConfig): BallPrediction {
  const state: BallPredictorState = {
    hasBaseline: false,
    ball: { x: 0, z: 0, vx: 0, vz: 0 },
    maxZ: cfg.halfWidthZ - cfg.ballRadius,
    restitutionWall: 1,
  };

  const reset = () => {
    state.hasBaseline = false;
    state.ball = { x: 0, z: 0, vx: 0, vz: 0 };
    state.maxZ = cfg.halfWidthZ - cfg.ballRadius;
    state.restitutionWall = 1;
  };

  const handleServerState = (game: GameState) => {
    state.restitutionWall = game.params.restitutionWall;
    state.maxZ = game.bounds.halfWidthZ - game.bounds.ballRadius;

    const serverBall = game.ball;

    state.ball = { x: serverBall.x, z: serverBall.z, vx: serverBall.vx, vz: serverBall.vz };
    state.hasBaseline = true;
  };

  const stepBall = (dt: number) => {
    const b = state.ball;

    b.x += b.vx * dt;
    b.z += b.vz * dt;

    const maxZ = state.maxZ;
    if (maxZ > 0) {
      if (b.z > maxZ) {
        b.z = maxZ;
        b.vz = -b.vz * state.restitutionWall;
      } else if (b.z < -maxZ) {
        b.z = -maxZ;
        b.vz = -b.vz * state.restitutionWall;
      }
    }
  };

  const predict = (dtSec: number): BallKinematics | null => {
    if (!state.hasBaseline) return null;
    const dt = Math.min(0.05, Math.max(0, dtSec));
    stepBall(dt);

    return { ...state.ball };
  };

  const getPredictedBall = (): BallKinematics | null => {
    return state.hasBaseline ? { ...state.ball } : null;
  };

  return {
    reset,
    handleServerState,
    predict,
    getPredictedBall,
  };
}
