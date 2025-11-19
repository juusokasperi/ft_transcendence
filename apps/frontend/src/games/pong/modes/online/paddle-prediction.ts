import type { GameState } from '@pong/game-logic';
import type { PlayerSeat } from '@pong/render';

export type Seat = 'P1' | 'P2';

type PredictorState = {
  hasBaseline: boolean;
  seat: PlayerSeat;
  paddleSpeed: number;
  maxZ: number;
  serverZ: number;
  predictedZ: number;
};

export type PaddlePredictionConfig = {
  seat: PlayerSeat;
  maxZ: number;
};

export type PaddlePrediction = {
  reset(seat: PlayerSeat): void;
  /** Update baseline from the latest authoritative server state. */
  handleServerState(state: GameState, seat: PlayerSeat): void;
  /**
   * Advance prediction for the local seat based on the latest axis input.
   * Returns the predicted Z for the local seat, or null if baseline is not ready.
   */
  predict(dtSec: number, axis: number): number | null;
  /** Latest predicted Z for the local seat, if any. */
  getPredictedZ(): number | null;
};

export function createPaddlePrediction(cfg: PaddlePredictionConfig): PaddlePrediction {
  const state: PredictorState = {
    hasBaseline: false,
    seat: cfg.seat,
    paddleSpeed: 0,
    maxZ: cfg.maxZ,
    serverZ: 0,
    predictedZ: 0,
  };

  const reset = (seat: PlayerSeat) => {
    state.hasBaseline = false;
    state.seat = seat;
    state.serverZ = 0;
    state.predictedZ = 0;
  };

  const handleServerState = (game: GameState, seat: PlayerSeat) => {
    state.seat = seat;
    state.paddleSpeed = game.params.paddleSpeed;
    const maxZ = game.bounds.halfWidthZ - game.bounds.paddleHalfDepthZ;
    state.maxZ = maxZ;

    const seatAtEast = game.playerAtEnd.east;
    const seatAtWest = game.playerAtEnd.west;
    let seatZ = 0;
    if (seatAtEast === seat) {
      seatZ = game.paddles.east.z;
    } else if (seatAtWest === seat) {
      seatZ = game.paddles.west.z;
    } else {
      seatZ = 0;
    }

    state.serverZ = seatZ;

    if (!state.hasBaseline) {
      state.predictedZ = seatZ;
      state.hasBaseline = true;
      return;
    }

    // Reconcile towards server position when drift accumulates.
    const delta = seatZ - state.predictedZ;
    // Small smoothing factor to avoid visible snaps while keeping close to authority.
    const reconcileFactor = 0.35;
    state.predictedZ += delta * reconcileFactor;
  };

  const predict = (dtSec: number, axis: number): number | null => {
    if (!state.hasBaseline) return null;
    const dt = Math.min(0.05, Math.max(0, dtSec));
    const vz = axis * state.paddleSpeed;
    let nextZ = state.predictedZ + vz * dt;

    const maxZ = state.maxZ;
    if (nextZ > maxZ) nextZ = maxZ;
    else if (nextZ < -maxZ) nextZ = -maxZ;

    state.predictedZ = nextZ;
    return state.predictedZ;
  };

  const getPredictedZ = (): number | null => {
    return state.hasBaseline ? state.predictedZ : null;
  };

  return {
    reset,
    handleServerState,
    predict,
    getPredictedZ,
  };
}
