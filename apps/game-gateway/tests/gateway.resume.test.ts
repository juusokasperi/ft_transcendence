// Tests the resume-token path in the game gateway:
//   - validation of resume tokens (iss/aud and room binding)
//   - rejection of invalid or failed resume verification with 4401
//   - successful proxying when resume token is valid and routing exists
import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingMessage } from 'http';

type UpgradeHandler = (
  req: IncomingMessage,
  socket: FakeSocket,
  head: Buffer,
) => Promise<void> | void;

type WriteMock = ReturnType<typeof vi.fn<(payload: string) => void>>;
type DestroyMock = ReturnType<typeof vi.fn<() => void>>;

interface FakeSocket extends EventEmitter {
  write: WriteMock;
  destroy: DestroyMock;
}

const upgradeHandlerRef: { handler?: UpgradeHandler } = {};

const serverOnMock = vi.fn<(event: string, handler: UpgradeHandler) => void>((event, handler) => {
  if (event === 'upgrade') {
    upgradeHandlerRef.handler = handler;
  }
});

const appListenMock = vi.fn(async () => undefined);
const appGetMock = vi.fn();
const appLogMock = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
const appRegisterMock = vi.fn();

const fastifyMock = vi.fn(() => ({
  server: { on: serverOnMock },
  get: appGetMock,
  listen: appListenMock,
  log: appLogMock,
  register: appRegisterMock,
}));

vi.mock('fastify', () => ({ default: fastifyMock }));

const proxyWsMock = vi.fn();
const createProxyServerMock = vi.fn(() => ({ ws: proxyWsMock }));

vi.mock('http-proxy', () => ({ default: createProxyServerMock }));

const redisGetMock = vi.fn<(key: string) => Promise<string | null>>();
const RedisMock = vi.fn(() => ({ get: redisGetMock }));
vi.mock('ioredis', () => ({ default: RedisMock }));

const verifyJoinTokenMock = vi.fn();
const verifyResumeTokenMock = vi.fn();

vi.mock('../config.ts', () => ({
  REDIS_URL: 'redis://tests',
  PORT: 8000,
}));

vi.mock('@pong/shared/auth/tokenSign', () => ({
  verifyJoinToken: verifyJoinTokenMock,
  verifyResumeToken: verifyResumeTokenMock,
}));

function createSocket(): FakeSocket {
  const socket = new EventEmitter() as FakeSocket;
  socket.write = vi.fn<(payload: string) => void>();
  socket.destroy = vi.fn<() => void>();
  return socket;
}

async function importGateway(): Promise<UpgradeHandler> {
  await import('../index.ts');
  const handler = upgradeHandlerRef.handler;
  if (!handler) throw new Error('Upgrade handler not registered');
  return handler;
}

function buildRequest(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return { url: '/g/room-abc', headers: {}, ...overrides } as IncomingMessage;
}

describe('gateway resume token path', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    upgradeHandlerRef.handler = undefined;
    proxyWsMock.mockReset();
    proxyWsMock.mockImplementation((_, __, ___, ____, cb) => cb?.(undefined));
    serverOnMock.mockReset();
    serverOnMock.mockImplementation((event, handler) => {
      if (event === 'upgrade') upgradeHandlerRef.handler = handler;
    });
    RedisMock.mockReset();
    redisGetMock.mockReset();
    fastifyMock.mockReset();
    fastifyMock.mockImplementation(() => ({
      server: { on: serverOnMock },
      get: appGetMock,
      listen: appListenMock,
      log: appLogMock,
      register: appRegisterMock,
    }));
    verifyJoinTokenMock.mockReset();
    verifyResumeTokenMock.mockReset();
    appListenMock.mockReset();
    appListenMock.mockResolvedValue(undefined);
    redisGetMock.mockResolvedValue('ws://node-1');
  });

  it('rejects resume when iss/aud invalid', async () => {
    verifyResumeTokenMock.mockReturnValueOnce({
      roomIdentifier: 'room-abc',
      iss: 'other',
      aud: 'bad',
      jti: 'x',
      iat: 1,
      exp: Math.floor(Date.now() / 1000) + 30,
      sub: 'p',
      sessionIdentifier: 's',
    });
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({ headers: { 'sec-websocket-protocol': 'resume,token-r' } });

    await handler(req, socket, Buffer.alloc(0));

    expect(socket.write).toHaveBeenCalledWith(
      'HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n',
    );
    expect(socket.destroy).toHaveBeenCalled();
    expect(proxyWsMock).not.toHaveBeenCalled();
  });

  it('proxies when resume token is valid', async () => {
    verifyResumeTokenMock.mockReturnValueOnce({
      roomIdentifier: 'room-abc',
      iss: 'game-server',
      aud: 'game-server',
      jti: 'j',
      iat: 1,
      exp: Math.floor(Date.now() / 1000) + 30,
      sub: 'p',
      sessionIdentifier: 's',
    });
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({ headers: { 'sec-websocket-protocol': 'resume,token-r' } });

    const head = Buffer.from('head');
    await handler(req, socket, head);

    expect(proxyWsMock).toHaveBeenCalled();
    expect(socket.write).not.toHaveBeenCalled();
  });

  it('rejects when token verification fails', async () => {
    verifyResumeTokenMock.mockReturnValueOnce(null);
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({ headers: { 'sec-websocket-protocol': 'resume,bad' } });
    await handler(req, socket, Buffer.alloc(0));
    expect(socket.write).toHaveBeenCalledWith(
      'HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n',
    );
    expect(proxyWsMock).not.toHaveBeenCalled();
  });
});
