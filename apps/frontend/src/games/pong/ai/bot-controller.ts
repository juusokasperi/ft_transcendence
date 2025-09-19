// apps/frontend/src/game/ai/bot-controller.ts

export type BotSeat = 'P1' | 'P2';
export type BotDifficulty = 'easy' | 'normal' | 'hard';

export type Observation = {
  ball: { x: number; z: number; vx: number; vz: number };
  paddles: { P1: { z: number }; P2: { z: number } };
  bounds: {
    leftPaddleX: number;
    rightPaddleX: number;
    halfWidthZ: number;
    ballRadius: number;
  };
  params: { paddleSpeed: number; restitutionWall: number };
};

type ObserveFn = () => Observation;

function dispatchKey(el: HTMLElement, type: 'keydown' | 'keyup', code: string) {
  // Dispatch directly to the canvas element — the input layer listens on it.
  el.dispatchEvent(
    new KeyboardEvent(type, {
      code,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function predictInterceptZ(
  z0: number,
  vz0: number,
  timeToPlane: number,
  zMax: number,
  restitution: number,
): number {
  // Reflective integration along Z with wall bounces and restitution.
  let t = Math.max(0, timeToPlane);
  let z = z0;
  let vz = vz0;
  const EPS = 1e-9;

  while (t > 1e-6) {
    if (Math.abs(vz) < EPS) {
      // No Z motion — done.
      return Math.max(-zMax, Math.min(z, zMax));
    }
    const timeToWall = vz > 0 ? (zMax - z) / vz : (-zMax - z) / vz;
    if (timeToWall > 0 && timeToWall < t) {
      z += vz * timeToWall;
      vz = -vz * restitution;
      t -= timeToWall;
    } else {
      z += vz * t;
      break;
    }
  }
  return Math.max(-zMax, Math.min(z, zMax));
}

export class BotController {
  private planTimer: number | null = null;
  private holdTimer: number | null = null;
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
    // 1 Hz planning per subject constraints.
    this.planTimer = window.setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.planTimer !== null) {
      clearInterval(this.planTimer);
      this.planTimer = null;
    }
    this.release();
  }

  setDifficulty(d: BotDifficulty) {
    this.difficulty = d;
  }

  private pressUp() {
    dispatchKey(this.el, 'keydown', this.seat === 'P1' ? 'KeyW' : 'ArrowUp');
  }
  private pressDown() {
    dispatchKey(this.el, 'keydown', this.seat === 'P1' ? 'KeyS' : 'ArrowDown');
  }
  private release() {
    const codes = this.seat === 'P1' ? ['KeyW', 'KeyS'] : ['ArrowUp', 'ArrowDown'];
    for (const c of codes) dispatchKey(this.el, 'keyup', c);
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private aimJitter(): number {
    const mags: Record<BotDifficulty, number> = { easy: 0.25, normal: 0.12, hard: 0.05 };
    const mag = mags[this.difficulty] ?? 0.12;
    return (Math.random() * 2 - 1) * mag;
  }

  private tick() {
    let o: Observation;
    try {
      o = this.observe();
    } catch {
      return; // no data yet
    }

    const meZ = this.seat === 'P1' ? o.paddles.P1.z : o.paddles.P2.z;
    const zMax = o.bounds.halfWidthZ - o.bounds.ballRadius;

    // Determine approach and plane params for my seat
    const approaching = this.seat === 'P2' ? o.ball.vx > 0 : o.ball.vx < 0;
    const planeX =
      this.seat === 'P2'
        ? o.bounds.rightPaddleX - o.bounds.ballRadius
        : o.bounds.leftPaddleX + o.bounds.ballRadius;

    let targetZ = 0;
    if (approaching) {
      const denom = o.ball.vx;
      const timeToPlane = denom !== 0 ? Math.abs((planeX - o.ball.x) / denom) : 0;

      // Optionally cap lookahead on easier modes
      const cap: Record<BotDifficulty, number> = { easy: 0.6, normal: 1.1, hard: 1.6 };
      const T = Math.min(timeToPlane, cap[this.difficulty]);

      targetZ = predictInterceptZ(o.ball.z, o.ball.vz, T, zMax, o.params.restitutionWall);

      targetZ += this.aimJitter();
      // Clamp target inside bounds to avoid chasing outside
      targetZ = Math.max(-zMax, Math.min(zMax, targetZ));
    } else {
      // Ball moving away — recenter with small random bias
      targetZ = Math.max(-zMax, Math.min(zMax, 0 + this.aimJitter() * 0.5));
    }

    const dz = targetZ - meZ;
    const dir = dz >= 0 ? 1 : -1;
    const tHoldSec = Math.min(1.0, Math.abs(dz) / Math.max(1e-6, o.params.paddleSpeed));

    // Actuate via keyboard simulation
    this.release();
    if (dir >= 0) this.pressUp();
    else this.pressDown();

    this.holdTimer = window.setTimeout(() => this.release(), Math.max(0, tHoldSec * 1000));
  }
}
