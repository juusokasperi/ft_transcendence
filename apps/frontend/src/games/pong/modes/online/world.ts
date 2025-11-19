import {
  createEngine,
  createWorld,
  FXManager,
  createScoreboard,
  computeBounds,
  createBounces,
  createPaddleAnimator,
} from '@pong/render';
import type { GameState } from '@pong/game-logic';
import { rgb01ToCss } from '../shared/preferences';
import { createLocalAudioKit, createLocalSfxDetectors } from '../shared/audio-utils';

export type OnlineWorldConfig = {
  canvas: HTMLCanvasElement;
  randomSeed: number;
  roomIdentifier: string;
  matchId: string;
};

export type OnlineWorld = {
  engine: ReturnType<typeof createEngine>['engine'];
  engineDisposable: ReturnType<typeof createEngine>['engineDisposable'];
  world: ReturnType<typeof createWorld>;
  bounds: GameState['bounds'];
  hud: ReturnType<typeof createScoreboard>;
  fx: FXManager;
  audioKit: ReturnType<typeof createLocalAudioKit>;
  audioBus: ReturnType<typeof createLocalAudioKit>['bus'];
  Bounces: ReturnType<typeof createBounces>;
  paddleAnim: ReturnType<typeof createPaddleAnimator>;
  sfxDetectors: ReturnType<typeof createLocalSfxDetectors>;
  clampPaddleZ: (z: number) => number;
  matColorCss: (mat: any) => string;
};

function hash32(s: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function createOnlineWorld(cfg: OnlineWorldConfig): OnlineWorld {
  const { canvas, randomSeed, roomIdentifier, matchId } = cfg;

  const { engine, engineDisposable } = createEngine(canvas);
  const world = createWorld(engine);
  const {
    scene,
    paddles: { left, right },
    table,
    ball,
  } = world;

  const hud = createScoreboard();
  hud.attachToCanvas(canvas);

  const { bounds } = computeBounds(world);
  const fx = new FXManager(scene, {
    wallZNorth: +bounds.halfWidthZ,
    wallZSouth: -bounds.halfWidthZ,
    ballMesh: ball.mesh,
    ballRadius: bounds.ballRadius,
    tableTop: table.tableTop,
    camera: world.camera,
  });

  const audioKit = createLocalAudioKit(scene, canvas);
  const audioBus = audioKit.bus;

  const matchSeed = randomSeed ?? hash32(roomIdentifier ?? matchId);

  const Bounces = createBounces(
    ball.mesh,
    table.tableTop.position.y,
    bounds.ballRadius,
    bounds.halfLengthX,
    left.mesh,
    right.mesh,
    matchSeed,
  );

  const paddleAnim = createPaddleAnimator(scene, left.mesh, right.mesh);

  const BASE_Y_FOR_AUDIO = table.tableTop.position.y + bounds.ballRadius / 2;
  const sfxDetectors = createLocalSfxDetectors(audioBus, BASE_Y_FOR_AUDIO);

  const paddleMaxZ = bounds.halfWidthZ - bounds.paddleHalfDepthZ;
  const clampPaddleZ = (z: number) => Math.max(-paddleMaxZ, Math.min(paddleMaxZ, z));

  const matColorCss = (mat: any): string => {
    const c = mat?.subSurface?.tintColor ?? mat?.diffuseColor ?? mat?.albedoColor;
    return rgb01ToCss({ r: c?.r ?? 1, g: c?.g ?? 1, b: c?.b ?? 1 });
  };

  return {
    engine,
    engineDisposable,
    world,
    bounds,
    hud,
    fx,
    audioKit,
    audioBus,
    Bounces,
    paddleAnim,
    sfxDetectors,
    clampPaddleZ,
    matColorCss,
  };
}
