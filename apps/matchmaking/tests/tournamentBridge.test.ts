/**
 * Tests for tournament "bridge" behavior in matchmaking.
 *
 * These cases validate the tournament handlers in `utils/scheduledMatches.ts`:
 *   - `handleCreateTournament`:
 *       * calls backend create + participant APIs,
 *       * updates client membership,
 *       * and sends initial `TOURNAMENT_LOBBY_UPDATED` + `TOURNAMENT_BRACKET_SNAPSHOT`.
 *   - `handleTournamentMatchesReady` / `handleAcceptScheduled`:
 *       * ensures a directed tournament match is only allocated (via `createMatch`)
 *         once both participants are present and have accepted.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { ClientState, type ClientInfo } from '../types/types';
import type {
  AcceptScheduledRequest,
  TournamentMatchesReadyMessage,
} from '@pong/shared/protocol/net';

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
    id: overrides.id ?? `client-${Math.random()}`,
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

function setupTournamentStateMocks() {
  axiosMocks.get.mockImplementation((url: string) => {
    if (url.endsWith('/api/tournaments/my/active')) {
      return Promise.resolve({ data: null });
    }
    if (url.endsWith('/api/tournaments/1')) {
      return Promise.resolve({ data: { id: 1, status: 'draft', maxParticipants: 4 } });
    }
    if (url.endsWith('/api/tournaments/1/participants')) {
      return Promise.resolve({
        data: [
          {
            id: 10,
            alias: 'Tester',
            seed: null,
            status: 'pending',
            userUuid: 'uuid-1',
          },
        ],
      });
    }
    if (url.endsWith('/api/tournaments/1/matches')) {
      return Promise.resolve({
        data: [
          {
            id: 21,
            roundNumber: 1,
            roundPosition: 1,
            status: 'pending',
            scheduledAt: null,
            completedAt: null,
            matchId: null,
          },
        ],
      });
    }
    if (url.includes('/api/tournaments/1/matches/21/players')) {
      return Promise.resolve({
        data: [
          {
            participantId: 10,
            teamNumber: 1,
          },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  });
}

describe('matchmaking tournament bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(axiosMocks).forEach((fn) => fn.mockReset());
    createMatchMock.mockReset();
  });

  it('registers creator and syncs bracket snapshot', async () => {
    const { handleCreateTournament } = await import('../utils/scheduledMatches.ts');

    axiosMocks.post.mockImplementation((url: string) => {
      if (url.endsWith('/api/tournaments')) {
        return Promise.resolve({ data: { id: 1 } });
      }
      if (url.endsWith('/api/tournaments/1/participants')) {
        return Promise.resolve({ data: { participant: { id: 10, alias: 'Tester' } } });
      }
      return Promise.resolve({ data: {} });
    });

    setupTournamentStateMocks();

    const client = makeClient();
    const clients = new Map([[client.id, client]]);

    await handleCreateTournament({ type: 'CREATE_TOURNAMENT', size: 4 }, client, clients);

    expect(axiosMocks.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/tournaments'),
      expect.objectContaining({ name: expect.any(String), format: 'single_elimination' }),
      expect.any(Object),
    );

    expect(client.tournamentId).toBe(1);
    expect(client.tournamentParticipantId).toBe(10);

    const sentPayloads = client.__sendMock.mock.calls.map((call) => {
      const [payload] = call as [unknown, ...unknown[]];
      return JSON.parse(String(payload)) as { type?: string };
    });
    expect(sentPayloads.some((message) => message.type === 'TOURNAMENT_LOBBY_UPDATED')).toBe(true);
    expect(sentPayloads.some((message) => message.type === 'TOURNAMENT_BRACKET_SNAPSHOT')).toBe(
      true,
    );
  });

  it('allocates directed match only after both players accept', async () => {
    vi.useFakeTimers();
    const { handleTournamentMatchesReady, handleAcceptScheduled } = await import(
      '../utils/scheduledMatches.ts'
    );

    createMatchMock.mockResolvedValue(undefined);
    setupTournamentStateMocks();

    const clientA = makeClient({ id: 'a', uuid: 'uuid-a', tournamentId: 1 });
    const clientB = makeClient({ id: 'b', uuid: 'uuid-b', tournamentId: 1 });
    const clients = new Map<string, ClientInfo>([
      ['a', clientA],
      ['b', clientB],
    ]);

    const readyPayload: TournamentMatchesReadyMessage = {
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

    handleTournamentMatchesReady(readyPayload, clients);
    expect(createMatchMock).not.toHaveBeenCalled();

    const acceptPayload: AcceptScheduledRequest = {
      type: 'ACCEPT_SCHEDULED',
      tournamentMatchId: 42,
    };
    await handleAcceptScheduled(acceptPayload, clientA, clients);
    expect(createMatchMock).not.toHaveBeenCalled();

    await handleAcceptScheduled(acceptPayload, clientB, clients);
    vi.advanceTimersByTime(51);
    await Promise.resolve();

    expect(createMatchMock).toHaveBeenCalledTimes(1);
    const [playerA, playerB, mode, context] = createMatchMock.mock.calls[0] as [
      ClientInfo,
      ClientInfo,
      string,
      { tournament?: { tournamentMatchId: number; tournamentId: number; tournamentStage: string } },
    ];
    expect(mode).toBe('tournament');
    expect(context).toMatchObject({
      tournament: { tournamentId: 1, tournamentMatchId: 42, tournamentStage: 'semifinal' },
    });
    expect([playerA.uuid, playerB.uuid].sort()).toEqual(['uuid-a', 'uuid-b']);

    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });
});
