import type { AppConfig } from '../app/Config.ts';
import type { GameState } from '@pong/game-logic';
import type { Seat, TableSide } from './MatchTypes.ts';

export function reconnectGraceMs(isTournament: boolean, cfg: AppConfig): number {
  return isTournament ? cfg.reconnectGraceMs.tournamentMs : cfg.reconnectGraceMs.casualMs;
}

export function seatToSide(playerAtEnd: GameState['playerAtEnd'], seat: Seat): TableSide {
  if (!playerAtEnd) {
    return seat === 'P1' ? 'east' : 'west';
  }
  return playerAtEnd.east === seat ? 'east' : 'west';
}
