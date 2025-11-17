import { orbitCameraFor } from '@pong/render';
import type { DomScoreboardAPI, AbstractMesh } from '@pong/render';
import type { GameState } from '@pong/game-logic';
import type { MatchSnapshot } from '@pong/shared';
import type { ArcRotateCamera } from '@pong/render';
import type { FrameBuffer } from './frame-buffer';
import { handleSwapSidesNow } from '../shared/utils';
import { applyOnlineSideSwap } from './swap-helpers';

export type PaddleAnimLike = {
  cue: (angleDeg: number) => void;
};

export type SideSwapDeps = {
  hud: DomScoreboardAPI;
  camera: ArcRotateCamera;
  leftMesh: AbstractMesh;
  rightMesh: AbstractMesh;
  paddleAnim: PaddleAnimLike;
  blockInputFor: (ms: number) => void;
  getNames: () => { east: string; west: string };
  getLatestMatch: () => MatchSnapshot | undefined;
  getLastKnownBestOf: () => number;
  frameBuffer: FrameBuffer;
};

export type SideSwapController = {
  getRowsMirrored(): boolean;
  handlePhaseTransition(
    prevPhase: GameState['phase'],
    s: GameState,
    matchSnap?: MatchSnapshot,
  ): void;
  handleSwapEvent(
    prevPhase: GameState['phase'] | null,
    s: GameState,
    matchSnap?: MatchSnapshot,
  ): void;
};

export function createSideSwapController(deps: SideSwapDeps): SideSwapController {
  let rowsMirrored = false;
  let spinningUntilMs = 0;
  let betweenHalfFired = false;
  let pendingBetweenSwap = false;
  let betweenSwapApplied = false;

  const snapshotForHud = (matchSnap?: MatchSnapshot): MatchSnapshot => {
    const latestMatch = deps.getLatestMatch();
    const lastKnownBestOf = deps.getLastKnownBestOf();
    return (
      matchSnap ??
      latestMatch ?? {
        bestOf: lastKnownBestOf,
        currentGameIndex: 0,
        gamesHistory: [],
      }
    );
  };

  const handlePhaseTransition = (
    prevPhase: GameState['phase'],
    s: GameState,
    matchSnap?: MatchSnapshot,
  ) => {
    if (prevPhase !== 'pauseBetweenGames' && s.phase === 'pauseBetweenGames') {
      const rawMs = Math.max(0, (s as any).tPauseBtwGamesMs ?? 0);
      const tickMsLocal = deps.frameBuffer.getTickMs();
      const ms = Math.max(0, rawMs - tickMsLocal);
      const until = handleSwapSidesNow(
        deps.hud,
        'gameOver',
        () => snapshotForHud(matchSnap),
        deps.getNames(),
        deps.blockInputFor,
        ms,
      );
      spinningUntilMs = until;
      betweenHalfFired = false;
      pendingBetweenSwap = false;
      betweenSwapApplied = false;
      const now = performance.now();
      const spinMs = Math.max(0, until - now);
      if (spinMs > 0) {
        orbitCameraFor(deps.camera, spinMs, {
          onHalf: () => {
            // Halfway through the rotation: perform the visual swap now.
            betweenHalfFired = true;
            if (!betweenSwapApplied) {
              rowsMirrored = applyOnlineSideSwap(deps.leftMesh, deps.rightMesh, rowsMirrored);
              betweenSwapApplied = true;
            }
            // If the server event came earlier and we deferred, it's now fulfilled.
            pendingBetweenSwap = false;
          },
        });
      }
    }
  };

  const handleSwapEvent = (
    prevPhase: GameState['phase'] | null,
    s: GameState,
    matchSnap?: MatchSnapshot,
  ) => {
    // Between-games swap events are visualized when entering pauseBetweenGames;
    // the later swapSidesNow event is logical only, so we ignore it here.
    if (prevPhase === 'pauseBetweenGames') {
      return;
    }

    const anyPrevPhase = prevPhase as GameState['phase'];
    const now = performance.now();
    if (spinningUntilMs > now || s.phase === 'pauseBetweenGames') {
      // Between-games swap is bound to the rotation's midpoint.
      if (betweenSwapApplied) {
        // Already applied at half — ignore duplicate event.
      } else if (betweenHalfFired) {
        // Half happened but swap not yet applied (race) — apply now.
        rowsMirrored = applyOnlineSideSwap(deps.leftMesh, deps.rightMesh, rowsMirrored);
        betweenSwapApplied = true;
      } else {
        // Defer until onHalf; ensures alignment.
        pendingBetweenSwap = true;
      }
    } else {
      const until = handleSwapSidesNow(
        deps.hud,
        anyPrevPhase,
        () => snapshotForHud(matchSnap),
        deps.getNames(),
        deps.blockInputFor,
      );
      // Track active spin window to align any subsequent events like between-games flow
      spinningUntilMs = until;
      betweenHalfFired = false;
      pendingBetweenSwap = false;
      betweenSwapApplied = false;
      const spinMs = Math.max(0, until - now);
      if (spinMs > 0) {
        orbitCameraFor(deps.camera, spinMs, {
          onHalf: () => {
            rowsMirrored = applyOnlineSideSwap(deps.leftMesh, deps.rightMesh, rowsMirrored);
            deps.paddleAnim.cue(180);
          },
        });
      } else {
        rowsMirrored = applyOnlineSideSwap(deps.leftMesh, deps.rightMesh, rowsMirrored);
        deps.paddleAnim.cue(180);
      }
    }
  };

  const getRowsMirrored = () => rowsMirrored;

  return {
    getRowsMirrored,
    handlePhaseTransition,
    handleSwapEvent,
  };
}
