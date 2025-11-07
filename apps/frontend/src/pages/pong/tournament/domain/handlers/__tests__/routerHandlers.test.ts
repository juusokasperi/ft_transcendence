import { describe, it, expect, vi } from 'vitest';
import { onConnected } from '../onConnected';
import { onError } from '../onError';
import { onMatchesReady } from '../onMatchesReady';
import { onCountdown } from '../onCountdown';
import { onLobbyUpdated } from '../onLobbyUpdated';
import type { MessageCtx } from '../types';

function baseCtx(overrides: Partial<MessageCtx> = {}): MessageCtx {
  const noop = () => {};
  const ctx: MessageCtx = {
    userUuid: null,
    getActiveTournamentId: () => null,
    navigate: noop,
    enqueueSnackbar: noop as any,
    getAvailableTournaments: () => [],
    setAvailableTournaments: noop,
    filterTournamentsForDisplay: (l) => l,
    loadTournaments: noop,
    refreshTournamentState: noop,
    setTournamentStatus: noop,
    setMaxParticipants: noop as any,
    setActiveTournamentId: noop as any,
    resetActiveTournamentState: noop,
    setParticipants: noop as any,
    setBracket: noop as any,
    setLatestReadyMatches: noop as any,
    setMatchCountdowns: (() => new Map()) as any,
    setMatchPhase: noop as any,
    getMatchPhase: () => 'idle',
    pendingMatchGet: () => null,
    pendingMatchSet: noop as any,
    clearCountdown: noop,
    setHandoff: noop as any,
    setConnectionReady: noop,
    ...overrides,
  };
  return ctx;
}

describe('handlers', () => {
  it('onConnected sets connection ready', () => {
    const set = vi.fn();
    const ctx = baseCtx({ setConnectionReady: set });
    onConnected({ type: 'CONNECTED' }, ctx);
    expect(set).toHaveBeenCalledWith(true);
  });

  it('onError handles AUTH error with navigate', () => {
    const nav = vi.fn();
    const snack = vi.fn();
    const ctx = baseCtx({ navigate: nav, enqueueSnackbar: snack });
    onError({ type: 'ERROR', code: 'AUTH', message: 'x' }, ctx);
    expect(nav).toHaveBeenCalledWith('/login');
    expect(snack).toHaveBeenCalled();
  });

  it('onMatchesReady assigns pending match for current user and prunes countdowns', () => {
    const userUuid = 'u-1';
    let countdownState = new Map<number, any>([
      [1, { any: true }],
      [2, { any: true }],
    ]);
    const setMatchCountdowns = vi.fn((updater: any) => {
      countdownState = updater(countdownState);
    });
    const setLatest = vi.fn();
    const setPending = vi.fn();
    const getPhase = vi.fn(() => 'idle');
    const setPhase = vi.fn();
    const ctx = baseCtx({
      userUuid,
      setMatchCountdowns: setMatchCountdowns as any,
      setLatestReadyMatches: setLatest as any,
      pendingMatchSet: setPending as any,
      getMatchPhase: getPhase as any,
      setMatchPhase: setPhase as any,
    });
    onMatchesReady(
      {
        type: 'TOURNAMENT_MATCHES_READY',
        matches: [
          {
            tournamentMatchId: 2,
            participants: [{ userUuid, participantId: 10, alias: 'a', seed: 1, status: 'pending' }],
          },
        ],
      } as any,
      ctx,
    );
    expect(setLatest).toHaveBeenCalled();
    expect(setPending).toHaveBeenCalled();
    expect(Array.from(countdownState.keys())).toEqual([2]);
  });

  it('onCountdown updates countdowns and advances personal phase', () => {
    let map = new Map<number, any>();
    const setMap = vi.fn((updater: any) => {
      map = updater(map);
    });
    const setPhase = vi.fn();
    const ctx = baseCtx({
      getActiveTournamentId: () => 1,
      setMatchCountdowns: setMap as any,
      pendingMatchGet: () => ({ tournamentMatchId: 42 }) as any,
      getMatchPhase: () => 'awaiting_start',
      setMatchPhase: setPhase as any,
    });
    onCountdown(
      {
        type: 'TOURNAMENT_MATCH_COUNTDOWN',
        tournamentId: 1,
        tournamentMatchId: 42,
        stage: 'semifinal',
        status: 'started',
        secondsRemaining: 0,
        targetStartEpochMs: Date.now(),
      },
      ctx,
    );
    expect(map.has(42)).toBe(true);
    expect(setPhase).toHaveBeenCalled();
  });

  it('onLobbyUpdated updates participants/meta and in-memory list (no network refresh)', () => {
    const setParticipants = vi.fn();
    const setStatus = vi.fn();
    const setMax = vi.fn();
    const setAvail = vi.fn();
    const ctx = baseCtx({
      userUuid: null,
      setParticipants: setParticipants as any,
      setTournamentStatus: setStatus,
      setMaxParticipants: setMax as any,
      setAvailableTournaments: setAvail as any,
      getAvailableTournaments: () => [],
      filterTournamentsForDisplay: (list) => list,
      navigate: vi.fn(),
    });
    onLobbyUpdated(
      {
        type: 'TOURNAMENT_LOBBY_UPDATED',
        tournamentId: 9,
        status: 'draft',
        participants: [],
        maxParticipants: 4,
      },
      ctx,
    );
    expect(setParticipants).toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith('draft');
    expect(setMax).toHaveBeenCalledWith(4);
    expect(setAvail).toHaveBeenCalled();
  });
});
