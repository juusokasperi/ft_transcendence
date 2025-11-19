import { createMatchController, tableTennisRules } from '@pong/game-logic';
import type { GameState } from '@pong/game-logic';
import type { MatchSnapshot, TableEnd } from '@pong/shared';
import { pickInitialServer } from '@pong/shared';
import type { RoomReservation } from './MatchTypes.ts';
import type { MatchController, StepResult, ServerEvents } from './TickEngine.ts';

type DisconnectGrace = {
  seat: 'P1' | 'P2';
  startedAt: number;
  timeoutCancel?: () => void;
};

export interface MatchStateSerializable {
  state: GameState;
  events: ServerEvents;
  snapshot?: MatchSnapshot;
}

function createBounds(): GameState['bounds'] {
  return {
    halfLengthX: 1.37,
    halfWidthZ: 0.7625,
    paddleHalfDepthZ: 0.075,
    leftPaddleX: -1.37,
    rightPaddleX: 1.37,
    ballRadius: 0.02,
  };
}

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

  markStart(startAtEpochMs: number): void {
    this.started = true;
    this.startAtEpochMs = startAtEpochMs;
  }

  markStopped(): void {
    this.started = false;
    this.startAtEpochMs = undefined;
  }

  startDisconnectGrace(seat: 'P1' | 'P2', cancel: () => void): void {
    this.disconnectGrace = {
      seat,
      startedAt: Date.now(),
      timeoutCancel: cancel,
    };
  }

  cancelDisconnectGrace(): void {
    if (this.disconnectGrace?.timeoutCancel) {
      this.disconnectGrace.timeoutCancel();
    }
    this.disconnectGrace = undefined;
  }
}
