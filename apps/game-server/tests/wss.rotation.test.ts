// Tests WSServer's resume-token rotation behavior:
//   - issued resume tokens use TTL = reconnectGrace + rotatePeriod
//   - rotation interval period matches the computed rotatePeriod
//   - replacing a connection updates the interval, and only the new
//     connection's close clears the active interval
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { WSServer } from '../src/infra/ws/WSServer.ts';
import type { AppConfig } from '../src/app/Config.ts';

class FakeSocket extends EventEmitter {
  public OPEN = 1;
  public readyState = 1;
  send = vi.fn();
  close = vi.fn((_code?: number, _reason?: string) => {
    this.emit('close');
  });
}

function createConfig(): AppConfig {
  return {
    httpPort: 0,
    wsPort: 0,
    adminSecret: 'x',
    redisUrl: 'redis://test',
    apiUrl: 'http://api',
    matchSecret: 'm',
    tickHz: 60,
    minStartDelayMs: 1500,
    // Use a small but non-zero lag compensation for tests; value does not
    // affect rotation logic being validated here.
    lagCompensationMs: 30,
    reconnectGraceMs: { casualMs: 15000, tournamentMs: 10000 },
  };
}

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

describe('WSServer resume rotation and interval lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues tokens with TTL = grace + rotatePeriod and sets interval to rotatePeriod', async () => {
    const logger = createLogger();
    const config = createConfig();

    const resumeIssue = vi
      .fn<
        (params: {
          roomIdentifier: string;
          playerIdentifier: string;
          sessionIdentifier: string;
          ttlMs: number;
        }) => Promise<{ resumeToken: string; claims: any }>
      >()
      .mockResolvedValue({ resumeToken: 't', claims: {} });

    const registry: any = {
      updateAxis: vi.fn(),
      getSession: vi.fn(() => session),
      detachPlayer: vi.fn((_room: string, seat: 'P1' | 'P2') => session.players.delete(seat)),
      clearSession: vi.fn(),
    };

    const server = new WSServer({
      config,
      registry,
      broadcaster: { broadcastResumeToken: vi.fn(), broadcastRoomState: vi.fn() } as any,
      runner: { resume: vi.fn() } as any,
      resumeTokens: { issue: resumeIssue } as any,
      reconnects: { onReconnect: vi.fn() } as any,
      redis: { publish: vi.fn(), exists: vi.fn(), defineCommand: vi.fn() } as any,
      logger,
      auth: { verifyJoinToken: vi.fn() } as any,
      // Reporter is not used in this test path; provide a minimal stub.
      reporter: { report: vi.fn() } as any,
    });

    const session: any = {
      reservation: { roomIdentifier: 'room-1', tournament: undefined },
      model: { id: 's-1', started: false },
      players: new Map(),
    };
    const player: any = {
      seat: 'P1',
      axis: 0,
      playerIdentifier: 'p-1',
      tokenJti: 'j-1',
    };
    const ws = new FakeSocket();

    const spyInterval = vi.spyOn(global, 'setInterval');

    // Call the private method via cast
    await (server as any).bindPlayerConnection(session, 'P1', player, ws);

    const grace = config.reconnectGraceMs.casualMs; // tournament false
    const expectedRotate = Math.max(3000, Math.floor(grace / 3));
    const expectedTtl = grace + expectedRotate;

    expect(resumeIssue).toHaveBeenCalled();
    const call = resumeIssue.mock.calls[0]?.[0];
    expect(call?.ttlMs).toBe(expectedTtl);

    expect(spyInterval).toHaveBeenCalled();
    const intervalDelay = spyInterval.mock.calls[0]?.[1] as number;
    expect(intervalDelay).toBe(expectedRotate);
  });

  it("old connection's close does not clear new interval", async () => {
    const logger = createLogger();
    const config = createConfig();
    const resumeTokens = {
      issue: vi.fn().mockResolvedValue({ resumeToken: 't', claims: {} }),
    } as any;

    const registry: any = {
      updateAxis: vi.fn(),
      getSession: vi.fn(() => session),
      detachPlayer: vi.fn((_room: string, seat: 'P1' | 'P2') => session.players.delete(seat)),
      clearSession: vi.fn(),
    };

    const server = new WSServer({
      config,
      registry,
      broadcaster: { broadcastResumeToken: vi.fn(), broadcastRoomState: vi.fn() } as any,
      runner: { resume: vi.fn(), stop: vi.fn() } as any,
      resumeTokens,
      reconnects: { onReconnect: vi.fn() } as any,
      redis: { publish: vi.fn(), exists: vi.fn(), defineCommand: vi.fn() } as any,
      logger,
      auth: { verifyJoinToken: vi.fn() } as any,
      reporter: { report: vi.fn() } as any,
    });

    const session: any = {
      reservation: { roomIdentifier: 'room-1', tournament: undefined },
      model: { id: 's-1', started: true },
      players: new Map([
        [
          'P1',
          {
            seat: 'P1',
            axis: 0,
            playerIdentifier: 'p-1',
            tokenJti: 'j-1',
          },
        ],
      ]),
    };
    const player: any = session.players.get('P1');

    const ws1 = new FakeSocket();
    await (server as any).bindPlayerConnection(session, 'P1', player, ws1);
    const interval1 = player.resumeInterval;
    expect(interval1).toBeTruthy();

    // Bind a new connection, replacing the previous one
    const ws2 = new FakeSocket();
    await (server as any).bindPlayerConnection(session, 'P1', player, ws2);
    const interval2 = player.resumeInterval;
    expect(interval2).toBeTruthy();
    expect(interval2).not.toBe(interval1);

    // Old connection closes after new interval is installed
    ws1.close();
    // Player should still have the new interval
    expect(player.resumeInterval).toBe(interval2);

    // New connection closes; interval should be cleared
    ws2.close();
    expect(player.resumeInterval).toBeUndefined();
  });
});
