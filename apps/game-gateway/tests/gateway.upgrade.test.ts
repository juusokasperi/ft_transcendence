// Tests the upgrade flow of the game gateway for `/g/:roomId`:
//   - URL parsing and rejection of invalid paths
//   - handling of missing/invalid Sec-WebSocket-Protocol headers and join tokens
//   - behavior when no room-to-node mapping exists in Redis
//   - single-use join token enforcement and related HTTP status codes
//   - successful proxying when all checks pass
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

const appListenMock = vi.fn(async () => {
  return undefined;
});

const appGetMock = vi.fn();

const appLogMock = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
};

const appRegisterMock = vi.fn();

const fastifyMock = vi.fn(() => ({
  server: {
    on: serverOnMock,
  },
  get: appGetMock,
  listen: appListenMock,
  log: appLogMock,
  register: appRegisterMock,
}));

vi.mock('fastify', () => ({
  default: fastifyMock,
}));

const wssOnMock = vi.fn();
const WebSocketServerMock = vi.fn(() => ({
  on: wssOnMock,
}));

vi.mock('ws', () => ({
  WebSocketServer: WebSocketServerMock,
  WebSocket: class {},
}));

const redisGetMock = vi.fn<(key: string) => Promise<string | null>>();
const redisSetMock =
  vi.fn<
    (key: string, value: string, mode: string, ttl: number, flag: string) => Promise<'OK' | null>
  >();
const RedisMock = vi.fn(() => ({
  get: redisGetMock,
  set: redisSetMock,
}));

vi.mock('ioredis', () => ({
  default: RedisMock,
}));

const proxyWsMock = vi.fn();
const createProxyServerMock = vi.fn(() => ({ ws: proxyWsMock }));

vi.mock('http-proxy', () => ({
  default: createProxyServerMock,
}));

type JoinClaims = {
  roomIdentifier: string;
  jti: string;
  exp?: number;
  iss?: string;
  aud?: string;
};
const verifyJoinTokenMock = vi.fn<(token: string) => JoinClaims | null>();

vi.mock('../config.ts', () => ({
  REDIS_URL: 'redis://tests',
  PORT: 8000,
}));

vi.mock('@pong/shared/auth/tokenSign', () => ({
  verifyJoinToken: verifyJoinTokenMock,
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
  return {
    url: '/g/room-123',
    headers: {},
    ...overrides,
  } as IncomingMessage;
}

describe('game gateway upgrade flow', () => {
  beforeEach(() => {
    upgradeHandlerRef.handler = undefined;
    vi.clearAllMocks();
    proxyWsMock.mockReset();
    proxyWsMock.mockImplementation((_, __, ___, ____, cb) => cb?.(undefined));
    redisGetMock.mockReset();
    redisSetMock.mockReset();
    verifyJoinTokenMock.mockReset();
    serverOnMock.mockReset();
    serverOnMock.mockImplementation((event, handler) => {
      if (event === 'upgrade') {
        upgradeHandlerRef.handler = handler;
      }
    });
    appGetMock.mockReset();
    appListenMock.mockReset();
    appListenMock.mockResolvedValue(undefined);
    appLogMock.info.mockReset();
    appLogMock.error.mockReset();
    appLogMock.debug.mockReset();
    appLogMock.warn.mockReset();
    fastifyMock.mockReset();
    appRegisterMock.mockReset();
    fastifyMock.mockImplementation(() => ({
      server: {
        on: serverOnMock,
      },
      get: appGetMock,
      listen: appListenMock,
      log: appLogMock,
      register: appRegisterMock,
    }));
    vi.resetModules();
  });

  it('destroys socket when URL does not match expected pattern', async () => {
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({ url: '/not-a-game' });

    await handler(req, socket, Buffer.alloc(0));

    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(socket.write).not.toHaveBeenCalled();
    expect(redisGetMock).not.toHaveBeenCalled();
  });

  it('returns 4401 when Sec-WebSocket-Protocol header missing', async () => {
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest();

    await handler(req, socket, Buffer.alloc(0));

    expect(socket.write).toHaveBeenCalledWith(
      'HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n',
    );
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('returns 4401 when token verification fails', async () => {
    verifyJoinTokenMock.mockReturnValueOnce(null);
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({
      headers: {
        'sec-websocket-protocol': 'bearer,token-123',
      },
    });

    await handler(req, socket, Buffer.alloc(0));

    expect(verifyJoinTokenMock).toHaveBeenCalledWith('token-123');
    expect(socket.write).toHaveBeenCalledWith(
      'HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n',
    );
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('returns 4401 when token room does not match request', async () => {
    verifyJoinTokenMock.mockReturnValueOnce({
      roomIdentifier: 'different',
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: 'jti-1',
      iss: 'mm',
      aud: 'game-node',
    });
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({
      headers: {
        'sec-websocket-protocol': 'bearer,token-456',
      },
    });

    await handler(req, socket, Buffer.alloc(0));

    expect(socket.write).toHaveBeenCalledWith(
      'HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n',
    );
    expect(socket.destroy).toHaveBeenCalled();
    expect(redisGetMock).not.toHaveBeenCalled();
  });

  it('destroys socket when no game node is stored in redis', async () => {
    verifyJoinTokenMock.mockReturnValueOnce({
      roomIdentifier: 'room-123',
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: 'jti-2',
      iss: 'mm',
      aud: 'game-node',
    });
    redisGetMock.mockResolvedValueOnce(null);
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({
      headers: {
        'sec-websocket-protocol': 'bearer,token-789',
      },
    });

    await handler(req, socket, Buffer.alloc(0));

    expect(redisGetMock).toHaveBeenCalledWith('room-to-node:room-123');
    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(socket.write).not.toHaveBeenCalled();
  });

  it('returns 4403 when join token has already been consumed', async () => {
    verifyJoinTokenMock.mockReturnValueOnce({
      roomIdentifier: 'room-locked',
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: 'jti-duplicate',
      iss: 'mm',
      aud: 'game-node',
    });
    redisGetMock.mockResolvedValueOnce('ws://game-node-1');
    redisSetMock.mockResolvedValueOnce(null);
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({
      url: '/g/room-locked',
      headers: {
        'sec-websocket-protocol': 'bearer,token-duplicate',
      },
    });

    await handler(req, socket, Buffer.alloc(0));

    expect(redisSetMock).toHaveBeenCalled();
    expect(socket.write).toHaveBeenCalledWith(
      'HTTP/1.1 4403 Forbidden\r\nConnection: close\r\n\r\n',
    );
    expect(socket.destroy).toHaveBeenCalled();
    expect(proxyWsMock).not.toHaveBeenCalled();
  });

  it('returns 4500 when redis set throws an error', async () => {
    verifyJoinTokenMock.mockReturnValueOnce({
      roomIdentifier: 'room-crash',
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: 'jti-crash',
      iss: 'mm',
      aud: 'game-node',
    });
    redisGetMock.mockResolvedValueOnce('ws://game-node-1');
    redisSetMock.mockRejectedValueOnce(new Error('redis down'));
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({
      url: '/g/room-crash',
      headers: {
        'sec-websocket-protocol': 'bearer,token-crash',
      },
    });

    await handler(req, socket, Buffer.alloc(0));

    expect(socket.write).toHaveBeenCalledWith(
      'HTTP/1.1 4500 Internal Server Error\r\nConnection: close\r\n\r\n',
    );
    expect(socket.destroy).toHaveBeenCalled();
    expect(proxyWsMock).not.toHaveBeenCalled();
  });

  it('proxies websocket upgrade when token and redis checks pass', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    verifyJoinTokenMock.mockReturnValueOnce({
      roomIdentifier: 'room-ok',
      exp: nowSec + 120,
      jti: 'jti-ok',
      iss: 'mm',
      aud: 'game-node',
    });
    redisGetMock.mockResolvedValueOnce('ws://game-node-2');
    redisSetMock.mockResolvedValueOnce('OK');
    const handler = await importGateway();
    const socket = createSocket();
    const req = buildRequest({
      url: '/g/room-ok',
      headers: {
        'sec-websocket-protocol': 'bearer,token-ok',
      },
    });

    const head = Buffer.from('head');
    await handler(req, socket, head);

    expect(redisSetMock).toHaveBeenCalledWith(
      'join-token:jti-ok',
      'room-ok',
      'EX',
      expect.any(Number),
      'NX',
    );
    const firstCall = redisSetMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const ttl = firstCall![3] as number;
    expect(ttl).toBeGreaterThan(0);
    expect(proxyWsMock).toHaveBeenCalledWith(
      req,
      socket,
      head,
      {
        target: 'ws://game-node-2',
        headers: {
          'sec-websocket-protocol': 'bearer,token-ok',
        },
      },
      expect.any(Function),
    );
    expect(socket.write).not.toHaveBeenCalled();
  });
});
