import { describe, it, expect, beforeEach, vi } from 'vitest';

const getRoutes = new Map<string, any>();
const postRoutes = new Map<string, { options: any; handler: any }>();

function createFakeApp() {
  const app: any = {};
  app.get = vi.fn((path: string, handler: any) => {
    getRoutes.set(path, handler);
    return app;
  });
  app.post = vi.fn((path: string, opts: any, handler?: any) => {
    let actualOptions = opts;
    let actualHandler = handler;
    if (typeof handler === 'undefined') {
      actualHandler = opts;
      actualOptions = undefined;
    }
    postRoutes.set(path, { options: actualOptions, handler: actualHandler });
    return app;
  });
  app.listen = vi.fn(async (opts: any, cb?: (err: Error | null, address: string) => void) => {
    if (cb) {
      cb(null, typeof opts === 'object' ? `http://localhost:${opts.port}` : String(opts));
    }
  });
  return app;
}

const fastifyMock = vi.fn(() => createFakeApp());

vi.mock('fastify', () => ({
  default: fastifyMock,
}));

const { createHttpServer } = await import('../utils/httpServer.ts');

function createReply() {
  return {
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    code: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
}

function buildMatches(playersByMatch: Array<[string, number]> = []) {
  const matches = new Map<string, any>();
  for (const [id, playerCount] of playersByMatch) {
    const players: Record<string, object | undefined> = { P1: undefined, P2: undefined };
    if (playerCount >= 1) players.P1 = {};
    if (playerCount >= 2) players.P2 = {};
    matches.set(id, { players });
  }
  return matches;
}

describe('createHttpServer', () => {
  beforeEach(() => {
    getRoutes.clear();
    postRoutes.clear();
    vi.clearAllMocks();
  });

  it('registers health and metrics endpoints with expected semantics', async () => {
    const matches = buildMatches([
      ['room-1', 2],
      ['room-2', 1],
    ]);
    const app = createHttpServer({
      ADMIN_SECRET: 'top-secret',
      HTTP_PORT: 7777,
      matches: matches as any,
      onCreateRoom: vi.fn(),
    });

    expect(fastifyMock).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith({ port: 7777, host: '0.0.0.0' }, expect.any(Function));

    const healthHandler = getRoutes.get('/health');
    expect(typeof healthHandler).toBe('function');
    const healthReply = createReply();
    await healthHandler({}, healthReply);
    expect(healthReply.send).toHaveBeenCalledWith({ status: 'ok' });

    const metricsHandler = getRoutes.get('/metrics');
    expect(typeof metricsHandler).toBe('function');
    const metricsReply = createReply();
    await metricsHandler({}, metricsReply);

    expect(metricsReply.type).toHaveBeenCalledWith('text/plain');
    const payload = metricsReply.send.mock.calls[0][0] as string;
    expect(payload).toContain('game_server_matches 2');
    expect(payload).toContain('game_server_players 3');
  });

  it('guards /admin/rooms with admin secret and forwards to onCreateRoom', async () => {
    const onCreateRoom = vi.fn().mockResolvedValue({ status: 'registered' });
    createHttpServer({
      ADMIN_SECRET: 'super-secret',
      HTTP_PORT: 8888,
      matches: buildMatches() as any,
      onCreateRoom,
    });

    const route = postRoutes.get('/admin/rooms');
    expect(route).toBeDefined();
    const [preHandler] = (route?.options?.preHandler ?? []) as Array<
      (req: any, reply: any, done: () => void) => void
    >;
    expect(typeof preHandler).toBe('function');

    const denyReply = createReply();
    const doneDeny = vi.fn();
    preHandler({ headers: {} }, denyReply, doneDeny);
    expect(denyReply.code).toHaveBeenCalledWith(403);
    expect(denyReply.send).toHaveBeenCalledWith({ error: 'Forbidden' });
    expect(doneDeny).not.toHaveBeenCalled();

    const allowReply = createReply();
    const doneAllow = vi.fn();
    preHandler({ headers: { 'x-admin-secret': 'super-secret' } }, allowReply, doneAllow);
    expect(doneAllow).toHaveBeenCalledTimes(1);

    const handler = route?.handler;
    expect(typeof handler).toBe('function');
    const reply = createReply();
    const request = { body: { roomIdentifier: 'room-1' } };
    await handler(request, reply);

    expect(onCreateRoom).toHaveBeenCalledWith(request.body);
    expect(reply.send.mock.calls.map((call) => call[0])).toEqual([
      { status: 'registered' },
      { status: 'room created' },
    ]);
  });

  it('returns bad request when onCreateRoom throws', async () => {
    const onCreateRoom = vi.fn().mockRejectedValue(new Error('invalid payload'));
    createHttpServer({
      ADMIN_SECRET: 'admin',
      HTTP_PORT: 9999,
      matches: buildMatches() as any,
      onCreateRoom,
    });

    const route = postRoutes.get('/admin/rooms');
    const handler = route?.handler;
    expect(handler).toBeTypeOf('function');

    const reply = createReply();
    const request = { body: {} };
    await handler(request, reply);

    expect(onCreateRoom).toHaveBeenCalledWith(request.body);
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send.mock.calls.map((call) => call[0])).toEqual([
      { error: 'invalid payload' },
      { status: 'room created' },
    ]);
  });
});
