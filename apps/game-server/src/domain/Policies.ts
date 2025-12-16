import type { AppConfig } from '../app/Config.ts';
import type { GameState } from '@pong/game-logic';
import type { Seat, TableSide } from './MatchTypes.ts';

/**
 * Resolve the reconnect grace period (in ms) based on match type.
 *
 * Tournament matches typically get a longer grace than casual matches so
 * players have more time to reconnect before an auto‑forfeit.
 */
export function reconnectGraceMs(isTournament: boolean, cfg: AppConfig): number {
  return isTournament ? cfg.reconnectGraceMs.tournamentMs : cfg.reconnectGraceMs.casualMs;
}

/**
 * Map a logical seat (P1/P2) to a table side ('east'/'west') using the
 * final playerAtEnd mapping from the GameState.
 *
 * If playerAtEnd is not available, falls back to a simple P1->east, P2->west mapping.
 *
 * Used when deciding which side won a match for reporting purposes and for
 * interpreting match-over events (which are reported in table‑side space).
 */
export function seatToSide(playerAtEnd: GameState['playerAtEnd'], seat: Seat): TableSide {
  if (!playerAtEnd) {
    return seat === 'P1' ? 'east' : 'west';
  }
  return playerAtEnd.east === seat ? 'east' : 'west';
}
