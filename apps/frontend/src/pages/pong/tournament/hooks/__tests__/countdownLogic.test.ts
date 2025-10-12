import { describe, expect, it } from 'vitest';
import type { TournamentMatchCountdownMessage } from '@pong/shared/protocol/net';
import {
  createCountdownSnapshot,
  nextMatchPhaseForCountdown,
  type MatchPhase,
} from '../useTournamentPageController';

const baseCountdown: TournamentMatchCountdownMessage = {
  type: 'TOURNAMENT_MATCH_COUNTDOWN',
  tournamentId: 1,
  tournamentMatchId: 42,
  stage: 'semifinal',
  status: 'running',
  secondsRemaining: 9,
  targetStartEpochMs: 1_700_000_000_000,
};

describe('tournament countdown helpers', () => {
  it('builds countdown snapshot from message payload', () => {
    const snapshot = createCountdownSnapshot(baseCountdown);
    expect(snapshot).toMatchObject({
      tournamentMatchId: 42,
      tournamentId: 1,
      stage: 'semifinal',
      status: 'running',
      secondsRemaining: 9,
      targetStartEpochMs: 1_700_000_000_000,
    });
  });

  it('keeps phase unchanged for non-personal countdowns', () => {
    const phase: MatchPhase = 'idle';
    const result = nextMatchPhaseForCountdown(phase, baseCountdown, false);
    expect(result).toBe('idle');
  });

  it('moves idle player into awaiting phase on running countdown', () => {
    const result = nextMatchPhaseForCountdown('idle', baseCountdown, true);
    expect(result).toBe('awaiting_start');
  });

  it('moves player into starting phase when countdown reports started', () => {
    const startedPayload: TournamentMatchCountdownMessage = {
      ...baseCountdown,
      status: 'started',
      secondsRemaining: 0,
    };
    expect(nextMatchPhaseForCountdown('awaiting_start', startedPayload, true)).toBe('starting');
    expect(nextMatchPhaseForCountdown('playing', startedPayload, true)).toBe('playing');
  });

  it('keeps players in active phases when countdown cancels mid-match', () => {
    const cancelledPayload: TournamentMatchCountdownMessage = {
      ...baseCountdown,
      status: 'cancelled',
      secondsRemaining: 5,
    };
    expect(nextMatchPhaseForCountdown('playing', cancelledPayload, true)).toBe('playing');
    expect(nextMatchPhaseForCountdown('idle', cancelledPayload, true)).toBe('awaiting_start');
  });
});
