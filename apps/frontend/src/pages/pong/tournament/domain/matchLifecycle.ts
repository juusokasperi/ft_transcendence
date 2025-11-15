import type { MatchPhase } from './countdown';

/**
 * Translate a successful HANDOFF into the next match phase.
 */
export function phaseAfterHandoff(_current: MatchPhase): MatchPhase {
  return 'starting';
}

/**
 * Determine the refresh delay after a match ends, based on reason.
 */
export function resolveRefreshDelayOnMatchEnd(reason: string): number {
  return reason === 'completed' ? 2500 : 1500;
}
