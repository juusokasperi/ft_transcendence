// apps/frontend/src/games/pong/ai/bot-controller.ts

export type BotSeat = 'P1' | 'P2';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export type Observation = {
  ball: { x: number; z: number; vx: number; vz: number };
  paddles: { P1: { z: number }; P2: { z: number } };
  paddlesByEnd?: { east: { z: number }; west: { z: number } };
  bounds: {
    leftPaddleX: number;
    rightPaddleX: number;
    halfWidthZ: number;
    ballRadius: number;
  };
  params: {
    paddleSpeed: number;
    restitutionWall: number;
  };
  // When true, control bindings are mirrored so the Arrow/WASD schemes
  // drive the opposite physical side. Use this to plan for the paddle
  // actually controlled by our keys.
  controlsMirrored?: boolean;
};

type ObserveFn = () => Observation;

type AxisDirection = 'up' | 'down' | 'none';

type MovementPlan = {
  direction: AxisDirection;
  holdMs: number;
  delayMs: number;
};

type DifficultyProfile = {
  reactionDelayMs: number;
  aimJitter: number;
  skipChance: number;
  speedScale: number;
  maxHoldMs: number;
  minHoldMs: number;
  deadZone: number;
  maxLookahead: number;
};

const DIFFICULTY: Record<BotDifficulty, DifficultyProfile> = {
  easy: {
    reactionDelayMs: 140,
    aimJitter: 0.22,
    skipChance: 0.15,
    speedScale: 1,
    maxHoldMs: 900,
    minHoldMs: 150,
    deadZone: 0.02,
    maxLookahead: 1.6,
  },
  normal: {
    reactionDelayMs: 100,
    aimJitter: 0.14,
    skipChance: 0.1,
    speedScale: 1,
    maxHoldMs: 850,
    minHoldMs: 120,
    deadZone: 0.02,
    maxLookahead: 1.6,
  },
  hard: {
    reactionDelayMs: 60,
    aimJitter: 0.01,
    skipChance: 0.001,
    speedScale: 1,
    maxHoldMs: 820,
    minHoldMs: 100,
    deadZone: 0.02,
    maxLookahead: 1.6,
  },
};

function dispatchKey(el: HTMLElement, type: 'keydown' | 'keyup', code: string) {
  el.dispatchEvent(
    new KeyboardEvent(type, {
      code,
      bubbles: true,
      cancelable: true,
    }),
  );
}

type ImpactPrediction = {
  approaching: boolean;
  targetZ: number;
  flightTime: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function randomCentered(magnitude: number) {
  if (magnitude <= 0) return 0;
  return (Math.random() * 2 - 1) * magnitude; // [-mag, +mag]
}

function predictImpact(obs: Observation, seat: BotSeat, maxLookahead: number): ImpactPrediction {
  // Determine which physical side this controller is currently driving.
  // In local mode, controls are mirrored on side swaps. When mirrored,
  // the keys for P1 control the right paddle and P2 keys control the left.
  const effectiveSeat: BotSeat = obs.controlsMirrored ? (seat === 'P1' ? 'P2' : 'P1') : seat;
  const planeX =
    effectiveSeat === 'P2'
      ? obs.bounds.rightPaddleX - obs.bounds.ballRadius
      : obs.bounds.leftPaddleX + obs.bounds.ballRadius;

  const vx = obs.ball.vx;
  const headingRight = vx > 0;
  const approaching = effectiveSeat === 'P2' ? headingRight : !headingRight;

  if (!approaching || Math.abs(vx) < 1e-6) {
    return { approaching: false, targetZ: 0, flightTime: Infinity };
  }

  const distance = planeX - obs.ball.x;
  const timeToPlane = Math.abs(distance / vx);
  const lookahead = Math.min(timeToPlane, maxLookahead);

  const zMax = obs.bounds.halfWidthZ - obs.bounds.ballRadius;
  const targetZ = integrateZ(obs.ball.z, obs.ball.vz, lookahead, zMax, obs.params.restitutionWall);

  return { approaching: true, targetZ, flightTime: lookahead };
}

function integrateZ(
  z0: number,
  vz0: number,
  time: number,
  zMax: number,
  restitution: number,
): number {
  let remaining = Math.max(0, time);
  let z = z0;
  let vz = vz0;
  const EPS = 1e-9;

  while (remaining > 1e-6) {
    if (Math.abs(vz) < EPS) {
      return clamp(z, -zMax, zMax);
    }

    const timeToWall = vz > 0 ? (zMax - z) / vz : (-zMax - z) / vz;

    if (timeToWall > 0 && timeToWall < remaining) {
      z += vz * timeToWall;
      vz = -vz * restitution;
      remaining -= timeToWall;
    } else {
      z += vz * remaining;
      break;
    }
  }

  return clamp(z, -zMax, zMax);
}

function buildPlan(obs: Observation, seat: BotSeat, profile: DifficultyProfile): MovementPlan {
  const prediction = predictImpact(obs, seat, profile.maxLookahead);
  // Match the planning paddle with the one our keys currently move.
  // Use end-centric channel when available to avoid P1/P2 ambiguity across swaps.
  const effectiveEnd: 'east' | 'west' = ((): 'east' | 'west' => {
    const mirrored = !!obs.controlsMirrored;
    if (!mirrored) return seat === 'P1' ? 'east' : 'west';
    return seat === 'P1' ? 'west' : 'east';
  })();
  const paddleZ = obs.paddlesByEnd
    ? obs.paddlesByEnd[effectiveEnd].z
    : effectiveEnd === 'east'
      ? obs.paddles.P1.z
      : obs.paddles.P2.z;
  const zLimit = obs.bounds.halfWidthZ - obs.bounds.ballRadius;

  let desired = 0;

  if (prediction.approaching) {
    const jitter = randomCentered(profile.aimJitter * zLimit);
    desired = prediction.targetZ + jitter;
  }

  desired = clamp(desired, -zLimit, zLimit);

  const delta = desired - paddleZ;
  if (Math.abs(delta) <= profile.deadZone) {
    return { direction: 'none', holdMs: 0, delayMs: 0 };
  }

  const direction: AxisDirection = delta > 0 ? 'up' : 'down';
  const distance = Math.abs(delta);

  const effectiveSpeed = Math.max(1e-3, obs.params.paddleSpeed * profile.speedScale);
  const durationSec = clamp(distance / effectiveSpeed, 0, profile.maxHoldMs / 1000);

  return {
    direction,
    holdMs: Math.max(profile.minHoldMs, Math.round(durationSec * 1000)),
    delayMs: profile.reactionDelayMs,
  };
}

export class BotController {
  private planTimer: number | null = null;
  private holdTimer: number | null = null;
  private pressTimer: number | null = null;
  private activeDirection: AxisDirection = 'none';
  private difficulty: BotDifficulty;

  constructor(
    private el: HTMLCanvasElement,
    private seat: BotSeat,
    private observe: ObserveFn,
    difficulty?: BotDifficulty,
  ) {
    this.difficulty = difficulty ?? 'normal';
  }

  start() {
    if (this.planTimer !== null) return;
    this.planTimer = window.setInterval(() => this.plan(), 1000);
  }

  stop() {
    if (this.planTimer !== null) {
      clearInterval(this.planTimer);
      this.planTimer = null;
    }
    this.cancelPendingPress();
    this.release();
  }

  setDifficulty(d: BotDifficulty) {
    this.difficulty = d;
  }

  private plan() {
    const profile = DIFFICULTY[this.difficulty] ?? DIFFICULTY.normal;

    if (Math.random() < profile.skipChance) {
      return;
    }

    let obs: Observation;
    try {
      obs = this.observe();
    } catch {
      return;
    }

    const movement = buildPlan(obs, this.seat, profile);
    this.applyPlan(movement);
  }

  private applyPlan(plan: MovementPlan) {
    if (plan.direction === 'none' && this.activeDirection === 'none') {
      this.cancelPendingPress();
      return;
    }

    this.cancelPendingPress();

    if (plan.direction === 'none') {
      this.release();
      return;
    }

    const keyCode = this.keyForDirection(plan.direction);

    const press = () => {
      this.activeDirection = plan.direction;
      dispatchKey(this.el, 'keydown', keyCode);
      this.holdTimer = window.setTimeout(() => this.release(), plan.holdMs);
    };

    if (plan.delayMs > 0) {
      this.pressTimer = window.setTimeout(() => {
        this.pressTimer = null;
        press();
      }, plan.delayMs);
    } else {
      press();
    }
  }

  private release() {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }

    const [upCode, downCode] = this.codesForSeat();
    if (this.activeDirection === 'up') {
      dispatchKey(this.el, 'keyup', upCode);
    } else if (this.activeDirection === 'down') {
      dispatchKey(this.el, 'keyup', downCode);
    }

    this.activeDirection = 'none';
  }

  private cancelPendingPress() {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  private keyForDirection(direction: AxisDirection): string {
    const isP1 = this.seat === 'P1';
    if (direction === 'up') {
      return isP1 ? 'KeyW' : 'ArrowUp';
    }
    if (direction === 'down') {
      return isP1 ? 'KeyS' : 'ArrowDown';
    }
    return isP1 ? 'KeyW' : 'ArrowUp';
  }

  private codesForSeat(): [string, string] {
    return this.seat === 'P1' ? ['KeyW', 'KeyS'] : ['ArrowUp', 'ArrowDown'];
  }
}
