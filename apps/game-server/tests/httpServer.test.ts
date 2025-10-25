import { describe, it, expect, beforeEach, vi } from 'vitest';

const getRoutes = new Map<string, any>();
const postRoutes = new Map<string, { options: any; handler: any }>();

const gaugeSetMock = vi.fn();
const gaugeInstanceMock = { set: gaugeSetMock };
const createdGauges: any[] = [];
const gaugeConstructorMock = vi.fn((config) => {
  createdGauges.push(config);
  return gaugeInstanceMock;
});
const metricsClientMock = {
  Gauge: gaugeConstructorMock,
};

const appLogMock = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
};

function createFakeApp() {
  const app: any = {};
  app.log = appLogMock;
  app.metrics = { client: metricsClientMock };

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
  app.after = vi.fn((cb) => {
    cb();
    return app;
  });

  app.register = vi.fn((plugin, opts) => {
    if (opts && opts.endpoint === '/metrics') {
      const metricsHandler = async (req: any, reply: any) => {
        let payload = '';
        for (const gaugeConfig of createdGauges) {
          const gaugeInstance = {
            set: (val: number) => {
              payload += `${gaugeConfig.name} ${val}\n`;
            },
          };
          gaugeConfig.collect.call(gaugeInstance);
        }
        reply.type('text/plain');
        reply.send(payload);
      };
      app.get(opts.endpoint, metricsHandler);
    }
    return app;
  });
  return app;
}



const fastifyMock = vi.fn(() => createFakeApp());

vi.mock('fastify', () => ({
  default: fastifyMock,
}));

const { createHttpServer } = await import('../src/infra/http/index.ts');

function createReply() {
  return {
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    code: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
}

describe('createHttpServer', () => {
  beforeEach(() => {
    getRoutes.clear();
    postRoutes.clear();
    vi.clearAllMocks();
    createdGauges.length = 0;
  });

  it('registers health and metrics endpoints with expected semantics', async () => {
    const registry = {
      metrics: vi.fn().mockReturnValue({
        matches: 2,
        players: 3,
        roomsWaiting: 1,
        roomsReady: 1,
        roomsPlaying: 1,
      }),
    };
    const app = createHttpServer({
      adminSecret: 'top-secret',
      port: 7777,
      registry: registry as any,
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

    expect(registry.metrics).toHaveBeenCalledTimes(5);
    expect(metricsReply.type).toHaveBeenCalledWith('text/plain');
    const payload = metricsReply.send.mock.calls[0][0] as string;
    expect(payload).toContain('game_server_matches 2');
    expect(payload).toContain('game_server_players 3');
    expect(payload).toContain('game_server_rooms_waiting 1');
    expect(payload).toContain('game_server_rooms_ready 1');
    expect(payload).toContain('game_server_rooms_playing 1');
  });

  it('guards /admin/rooms with admin secret and forwards to onCreateRoom', async () => {
    const onCreateRoom = vi.fn().mockResolvedValue({ status: 'registered' });
    createHttpServer({
      adminSecret: 'super-secret',
      port: 8888,
      registry: {
        metrics: vi.fn().mockReturnValue({
          matches: 0,
          players: 0,
          roomsWaiting: 0,
          roomsReady: 0,
          roomsPlaying: 0,
        }),
      } as any,
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
    expect(reply.send).toHaveBeenCalledWith({ status: 'registered' });
  });

  it('returns bad request when onCreateRoom throws', async () => {
    const onCreateRoom = vi.fn().mockRejectedValue(new Error('invalid payload'));
    createHttpServer({
      adminSecret: 'admin',
      port: 9999,
      registry: {
        metrics: vi.fn().mockReturnValue({
          matches: 0,
          players: 0,
          roomsWaiting: 0,
          roomsReady: 0,
          roomsPlaying: 0,
        }),
      } as any,
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
    expect(reply.send).toHaveBeenCalledWith({ error: 'invalid payload' });
  });
});
