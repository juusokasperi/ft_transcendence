import { createMatchController, tableTennisRules } from '@pong/game-logic';
import type { GameState } from '@pong/game-logic';
import type { MatchSnapshot, TableEnd } from '@pong/shared';
import { pickInitialServer } from '@pong/shared';
import { PADDLE_HITBOX_PADDING_Z } from '@pong/shared';
import type { RoomReservation } from './MatchTypes.ts';
import type { MatchController, StepResult, ServerEvents } from './TickEngine.ts';

/**
 * Metadata for an active disconnect-grace window.
 *
 * Used by ReconnectManager + MatchModel to track which seat is in grace and
 * when the grace started, as well as a cancel function for the scheduled timeout.
 */
type DisconnectGrace = {
  seat: 'P1' | 'P2';
  startedAt: number;
  timeoutCancel?: () => void;
};

/**
 * Minimal serializable representation of a match state snapshot.
 *
 * This interface mirrors what the data plane exposes (GameState, events, snapshot)
 * and is used by ResultReporter and other consumers that only need read‑only views.
 */
export interface MatchStateSerializable {
  state: GameState;
  events: ServerEvents;
  snapshot?: MatchSnapshot;
}

/**
 * Construct the physical bounds for the Pong table.
 *
 * These values define:
 *   - table size (halfLengthX/halfWidthZ)
 *   - paddle sizes and collision hitboxes
 *   - ball radius
 *
 * They are shared between server simulation and any client‑side logic that relies
 * on @pong/game-logic.
 */
function createBounds(): GameState['bounds'] {
  return {
    halfLengthX: 1.37,
    halfWidthZ: 0.7625,
    paddleHalfDepthZ: 0.075,
    paddleCollisionHalfDepthZ: 0.075 + PADDLE_HITBOX_PADDING_Z,
    leftPaddleX: -1.37,
    rightPaddleX: 1.37,
    ballRadius: 0.02,
  };
}

/**
 * MatchModel holds the in‑memory state and lifecycle for a single match:
 *
 *   - `reservation`: immutable room metadata from allocator/matchmaking.
 *   - `controller`: @pong/game-logic MatchController instance.
 *   - `state`: current GameState for the simulation.
 *   - `tick`: authoritative tick index.
 *   - `lastEvents` / `lastSnapshot`: latest simulation outputs for broadcasting.
 *   - lifecycle flags: started, resultSubmitting/resultSubmitted, disconnectGrace.
 *   - loop control: startTimeoutCancel and loopCancel for MatchRunner scheduling.
 *
 * MatchRunner drives this model by calling `applyStep`, `setLoopCancel`, `markStart`,
 * `markStopped`, and the disconnect-grace helpers.
 */
export class MatchModel {
  readonly id: string;
  readonly reservation: RoomReservation;
  readonly controller: MatchController;
  readonly initialServer: TableEnd;

  state: GameState;
  tick = 0;
  lastEvents: ServerEvents = {} as ServerEvents;
  lastSnapshot?: MatchSnapshot;
  started = false;
  startAtEpochMs?: number;
  resultSubmitting = false;
  resultSubmitted = false;
  disconnectGrace?: DisconnectGrace;

  private loopCancel?: () => void;
  private startTimeoutCancel?: () => void;

  private constructor(args: {
    id: string;
    reservation: RoomReservation;
    controller: MatchController;
    initialServer: TableEnd;
  }) {
    this.id = args.id;
    this.reservation = args.reservation;
    this.controller = args.controller;
    this.initialServer = args.initialServer;
    this.state = this.controller.getGame();
  }

  /**
   * Factory for creating a MatchModel from a RoomReservation.
   *
   * It:
   *   - builds bounds and rules
   *   - picks an initial server based on reservation.randomSeed
   *   - creates a MatchController from @pong/game-logic
   */
  static create(reservation: RoomReservation): MatchModel {
    const bounds = createBounds();
    const rules = tableTennisRules();
    const initialServer = pickInitialServer(reservation.randomSeed);
    const controller = createMatchController(bounds, rules, initialServer);
    return new MatchModel({
      id: reservation.roomIdentifier,
      reservation,
      controller,
      initialServer,
    });
  }

  /**
   * Apply a simulation step result to this model:
   *   - update state
   *   - record last events
   *   - record last snapshot for consumers (broadcaster/result reporter)
   */
  applyStep(result: StepResult): void {
    this.state = result.state;
    this.lastEvents = result.events;
    this.lastSnapshot = result.snapshot;
  }

  loopActive = false;

  setLoopCancel(cancel: (() => void) | undefined): void {
    if (this.loopCancel) {
      this.loopCancel();
    }
    this.loopCancel = cancel;
    this.loopActive = Boolean(cancel);
  }

  cancelLoop(): void {
    if (this.loopCancel) {
      this.loopCancel();
      this.loopCancel = undefined;
    }
    this.loopActive = false;
  }

  /**
   * Track the pending start timeout so it can be overridden or cleared.
   *
   * MatchRunner uses this to ensure only one start timer is active at a time.
   */
  setStartTimeout(cancel: (() => void) | undefined): void {
    if (this.startTimeoutCancel) {
      this.startTimeoutCancel();
    }
    this.startTimeoutCancel = cancel;
  }

  clearStartTimeout(): void {
    if (this.startTimeoutCancel) {
      this.startTimeoutCancel();
      this.startTimeoutCancel = undefined;
    }
  }

  /** Mark the match as started at a given epoch timestamp. */
  markStart(startAtEpochMs: number): void {
    this.started = true;
    this.startAtEpochMs = startAtEpochMs;
  }

  /** Mark the match as fully stopped (no longer running). */
  markStopped(): void {
    this.started = false;
    this.startAtEpochMs = undefined;
  }

  /**
   * Begin tracking a disconnect grace window for a given seat.
   *
   * ReconnectManager calls this when scheduling a timeout that will auto‑award
   * the win if the player does not reconnect in time.
   */
  startDisconnectGrace(seat: 'P1' | 'P2', cancel: () => void): void {
    this.disconnectGrace = {
      seat,
      startedAt: Date.now(),
      timeoutCancel: cancel,
    };
  }

  /**
   * Cancel any active disconnect grace window and its timeout.
   *
   * Called when a player reconnects or when the match is being terminated.
   */
  cancelDisconnectGrace(): void {
    if (this.disconnectGrace?.timeoutCancel) {
      this.disconnectGrace.timeoutCancel();
    }
    this.disconnectGrace = undefined;
  }
}
