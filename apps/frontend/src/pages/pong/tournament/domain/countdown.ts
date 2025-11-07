import type { TournamentMatchCountdownMessage } from '../net/messageTypes';
import type { CountdownSnapshot } from '../state/types';

export type MatchPhase = 'idle' | 'awaiting_start' | 'starting' | 'playing';

export function createCountdownSnapshot(
  payload: TournamentMatchCountdownMessage,
): CountdownSnapshot {
  return {
    tournamentMatchId: payload.tournamentMatchId,
    tournamentId: payload.tournamentId,
    stage: payload.stage,
    status: payload.status,
    targetStartEpochMs: payload.targetStartEpochMs,
    secondsRemaining: payload.secondsRemaining,
  };
}

export function nextMatchPhaseForCountdown(
  currentPhase: MatchPhase,
  payload: TournamentMatchCountdownMessage,
  isPersonal: boolean,
): MatchPhase {
  if (!isPersonal) return currentPhase;
  if (payload.status === 'started') {
    return currentPhase === 'playing' ? 'playing' : 'starting';
  }
  if (payload.status === 'cancelled') {
    return currentPhase === 'starting' || currentPhase === 'playing' ? currentPhase : 'awaiting_start';
  }
  return currentPhase === 'starting' || currentPhase === 'playing' ? currentPhase : 'awaiting_start';
}
