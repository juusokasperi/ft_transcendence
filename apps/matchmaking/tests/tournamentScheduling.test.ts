import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { ClientState, type ClientInfo } from '../types/types';
import type { TournamentMatchesReadyMessage } from '@pong/shared/protocol/net';

const axiosMocks = {
  post: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock('axios', () => ({
  default: axiosMocks,
  ...axiosMocks,
}));

const createMatchMock = vi.fn();
vi.mock('../utils/queue.ts', () => ({
  createMatch: createMatchMock,
}));

const logMock = vi.fn();
vi.mock('@utils/logger', () => ({
  log: logMock,
}));

vi.mock('../utils/config.ts', () => ({
  API_URL: 'http://localhost:3001',
  SECRET: 'secret',
  PORT: 0,
  ALLOCATOR_URL: 'http://allocator',
  REDIS_URL: 'redis://localhost',
  JOIN_TOKEN_TTL_SECONDS: 60,
  LOBBY_TTL_MS: 300000,
  LOBBY_SIZE: 2,
  TOURNAMENT_REMINDER_DELAY_MS: 20,
  TOURNAMENT_MAX_REMINDERS: 2,
  TOURNAMENT_MATCH_AUTO_START_DELAY_MS: 50,
  TOURNAMENT_MATCH_COUNTDOWN_INTERVAL_MS: 10,
}));

type TestClient = ClientInfo & { __sendMock: ReturnType<typeof vi.fn> };

function makeClient(overrides: Partial<ClientInfo> = {}): TestClient {
  const send = vi.fn();
  return {
    id: overrides.id ?? `client-${Math.random().toString(36).slice(2)}`,
    mmr: overrides.mmr ?? 1000,
    socket: { send } as unknown as WebSocket,
    username: overrides.username ?? 'Tester',
    ready: overrides.ready ?? true,
    uuid: overrides.uuid ?? 'uuid-1',
    authenticated: overrides.authenticated ?? true,
    lastRateLimitNotice: overrides.lastRateLimitNotice ?? Date.now(),
    state: overrides.state ?? ClientState.IDLE,
    previousState: overrides.state ?? undefined,
    joinedAt: overrides.joinedAt ?? Date.now(),
    tournamentId: overrides.tournamentId,
    tournamentParticipantId: overrides.tournamentParticipantId,
    siteToken: overrides.siteToken ?? 'token',
    __sendMock: send,
  };
}

function parseSentPayloads(client: TestClient) {
  return client.__sendMock.mock.calls.map((call) => {
    const [raw] = call as [unknown, ...unknown[]];
    return JSON.parse(String(raw)) as { type?: string; status?: string };
  });
}

beforeEach(() => {
  vi.resetModules();
  Object.values(axiosMocks).forEach((fn) => fn.mockReset());
  createMatchMock.mockReset();
  logMock.mockReset();
});

const axiosSuccessTemplates = {
  tournament: { id: 1, status: 'active', maxParticipants: 4 },
  participants: [] as Array<Record<string, unknown>>,
  matches: [] as Array<Record<string, unknown>>,
};

function setupAxiosTournamentMocks() {
  axiosMocks.get.mockImplementation((url: string) => {
    if (url.endsWith('/api/tournaments/1')) {
      return Promise.resolve({ data: axiosSuccessTemplates.tournament });
    }
    if (url.endsWith('/api/tournaments/1/participants')) {
      return Promise.resolve({ data: axiosSuccessTemplates.participants });
    }
    if (url.endsWith('/api/tournaments/1/matches')) {
      return Promise.resolve({ data: axiosSuccessTemplates.matches });
    }
    return Promise.resolve({ data: {} });
  });
}

describe('tournament scheduling cadence', () => {
  it('emits countdown ticks and auto-starts when both players are online', async () => {
    vi.useFakeTimers();
    setupAxiosTournamentMocks();
    const { handleTournamentMatchesReady } = await import('../utils/scheduledMatches.ts');

    const clientA = makeClient({ id: 'a', uuid: 'uuid-a', tournamentId: 1 });
    const clientB = makeClient({ id: 'b', uuid: 'uuid-b', tournamentId: 1 });
    const clients = new Map<string, ClientInfo>([
      ['a', clientA],
      ['b', clientB],
    ]);

    const payload: TournamentMatchesReadyMessage = {
      type: 'TOURNAMENT_MATCHES_READY',
      tournamentId: 1,
      matches: [
        {
          tournamentMatchId: 42,
          stage: 'semifinal',
          participants: [
            { participantId: 10, teamNumber: 1, alias: 'Alpha', userUuid: 'uuid-a' },
            { participantId: 11, teamNumber: 2, alias: 'Beta', userUuid: 'uuid-b' },
          ],
        },
      ],
    };

    await handleTournamentMatchesReady(payload, clients);

    const initialMessages = parseSentPayloads(clientA);
    expect(initialMessages.some((message) => message.type === 'TOURNAMENT_MATCHES_READY')).toBe(
      true,
    );

    vi.advanceTimersByTime(11);
    const tickMessages = parseSentPayloads(clientA).filter(
      (message) => message.type === 'TOURNAMENT_MATCH_COUNTDOWN',
    );
    expect(tickMessages.length).toBeGreaterThanOrEqual(1);
    expect(tickMessages.at(-1)).toMatchObject({
      tournamentMatchId: 42,
      status: 'running',
    });

    vi.advanceTimersByTime(50);
    expect(createMatchMock).toHaveBeenCalledTimes(1);
    expect(parseSentPayloads(clientA).some((message) => message.status === 'started')).toBe(true);

    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('retries matches for offline players and clears reminders after auto-start', async () => {
    vi.useFakeTimers();
    setupAxiosTournamentMocks();
    const { handleTournamentMatchesReady } = await import('../utils/scheduledMatches.ts');

    const clientA = makeClient({ id: 'a', uuid: 'uuid-a', tournamentId: 1 });
    const clients = new Map<string, ClientInfo>([['a', clientA]]);

    const payload: TournamentMatchesReadyMessage = {
      type: 'TOURNAMENT_MATCHES_READY',
      tournamentId: 1,
      matches: [
        {
          tournamentMatchId: 99,
          stage: 'semifinal',
          participants: [
            { participantId: 10, teamNumber: 1, alias: 'Alpha', userUuid: 'uuid-a' },
            { participantId: 11, teamNumber: 2, alias: 'Beta', userUuid: 'uuid-b' },
          ],
        },
      ],
    };

    await handleTournamentMatchesReady(payload, clients);

    // No countdown should start until second player is present
    expect(
      parseSentPayloads(clientA).some((message) => message.type === 'TOURNAMENT_MATCHES_READY'),
    ).toBe(false);

    const clientB = makeClient({ id: 'b', uuid: 'uuid-b', tournamentId: 1 });
    clients.set('b', clientB);

    vi.advanceTimersByTime(21);

    const notificationMessages = parseSentPayloads(clientB).filter(
      (message) => message.type === 'TOURNAMENT_MATCHES_READY',
    );
    expect(notificationMessages.length).toBe(1);

    vi.advanceTimersByTime(60);
    expect(createMatchMock).toHaveBeenCalledTimes(1);

    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });
});
