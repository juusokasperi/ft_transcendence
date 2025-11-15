import type { DomScoreboardAPI } from '@pong/render';
import type { FXManager, AbstractMesh } from '@pong/render';
import { incHide, decHide } from '@pong/render';
import { mapHistoryForPlayers } from '@pong/render';
import type { GameState } from '@pong/game-logic';
import type { MatchSnapshot, TableEnd } from '@pong/shared';

/** Show a HUD message and block input; returns the timestamp until which
 * gameplay should be paused (performance.now() based).
 */
function announceAndPause(
  hud: DomScoreboardAPI,
  text: string,
  ms: number,
  blockInputFor: (ms: number) => void,
): number {
  const dur = Math.max(0, ms | 0);
  hud.flashMessage(text, dur);
  blockInputFor(dur);
  return performance.now() + dur;
}

/** Swap paddle materials so colors/skins follow players across sides. */
export function swapPaddleMaterials(left: AbstractMesh, right: AbstractMesh): void {
  const m = left.material;
  left.material = right.material;
  right.material = m;
}

/** Handle match-over UX: message + host event dispatch. */
export function handleMatchOver(
  hud: DomScoreboardAPI,
  names: { east: string; west: string },
  winner: TableEnd,
  getSnapshot: () => MatchSnapshot,
  canvas: HTMLCanvasElement,
  messageMs = 3800,
): void {
  // Map winner via last game's history (player-pinned rows) to avoid end/row mismatch
  const snap = getSnapshot();
  const historyForHUD = mapHistoryForPlayers(snap.gamesHistory);
  const last = historyForHUD[historyForHUD.length - 1];
  const winnerRow = (last?.winner ?? winner) as TableEnd; // fallback to end if history missing
  hud.flashMessage(`${names[winnerRow]} won, impressive match!`, messageMs);
  canvas.dispatchEvent(
    new CustomEvent('pong:matchOver', {
      detail: { winner, bestOf: snap.bestOf, gamesHistory: historyForHUD, names },
    }),
  );
}

/** Show swap message (mid-game or between-games). Returns pause-until timestamp. */
export function handleSwapSidesNow(
  hud: DomScoreboardAPI,
  prevPhase: GameState['phase'],
  getSnapshot: () => MatchSnapshot,
  names: { east: string; west: string },
  blockInputForFn: (ms: number) => void,
  messageMs = 3200,
): number {
  const isMidGame = prevPhase === 'rally';
  if (isMidGame) {
    return announceAndPause(hud, 'Swapping mid-game for decisive game', messageMs, blockInputForFn);
  }
  const snap = getSnapshot();
  const hist = snap.gamesHistory || [];
  const last = hist[hist.length - 1];
  if (last?.winner) {
    const winnerRow = last.winner as TableEnd;
    return announceAndPause(
      hud,
      `Swapping side!`,
      messageMs,
      blockInputForFn,
    );
  }
  return 0;
}

/**
 * Shared serve-selection intro: hides the ball, runs FX, and reveals it.
 * Optionally schedules a visual bounce serve in advance.
 */
export async function runServeSelectionIntro(
  fx: FXManager,
  ballMesh: AbstractMesh,
  server: 'east' | 'west',
  scheduleBounce?: (dir: -1 | 1) => void,
): Promise<void> {
  // Two hide refs to tolerate internal FX hide bumps; release both after.
  incHide(ballMesh);
  incHide(ballMesh);
  try {
    const dir = server === 'east' ? -1 : 1;
    scheduleBounce?.(dir);
  } catch {}
  await fx.serveSelection(server);
  try {
    decHide(ballMesh);
    decHide(ballMesh);
  } catch {}
}
