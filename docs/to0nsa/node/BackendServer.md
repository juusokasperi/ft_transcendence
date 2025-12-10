# Backend Server (`apps/backend`) – Fastify API Design

This document explains how the **main backend API server** is structured using Node + Fastify:

- How the Fastify instance is configured.
- Which plugins are used (CORS, cookies, static, Swagger).
- How routes, hooks, and error handling are organized.

For a functional view of the APIs (login, matches, stats), see:

- `docs/to0nsa/workflow/BackendAndAPIs.md`

Here we focus on the **Node/Fastify mechanics**.

---

## 1. Fastify app setup

**File:** `apps/backend/index.ts`

Fastify is initialized with:

```ts
const app = fastify({
  logger: createFastifyLoggerConfig({ service: 'api' }),
  ajv: {
    customOptions: { allErrors: true, removeAdditional: true },
  },
});
```

Key points:

- **Logger:** `createFastifyLoggerConfig({ service: 'api' })`:
  - Uses the shared logging util (`@utils/logger`).
  - Adds service name `api` to log entries.
- **AJV config:** `allErrors: true`, `removeAdditional: true`:
  - Validates request payloads against schemas.
  - Strips unexpected fields to reduce risk of accidental persistence of extra properties.

Error handling:

```ts
app.setErrorHandler(prettierErrorMessages);
```

- `prettierErrorMessages` converts internal errors and validation problems into cleaner JSON responses.

Metrics:

```ts
registerMetrics(app, { labels: { service: 'api' } });
```

- Exposes `/metrics` with Prometheus metrics, labeled with `service="api"`.

---

## 2. Core plugins

The backend registers a number of Fastify plugins:

### 2.1 Swagger and Swagger UI

```ts
await app.register(swagger, swaggerConfig);
await app.register(swaggerUi, { routePrefix: '/docs' });
await app.ready();
app.swagger();
```

- `swaggerConfig` sets up OpenAPI schema generation.
- `/docs` provides interactive API documentation.

### 2.2 Cookies

```ts
await app.register(cookie);
```

- Enables cookie parsing and response helpers.
- Used for HTTP‑only auth cookies (access and refresh tokens).

### 2.3 Google sign‑in

```ts
await app.register(googleSign);
```

- Registers Google OAuth routes (implementation in `routes/googleSign.ts`).

### 2.4 CORS

```ts
await app.register(cors, {
  origin: (origin, cb) => {
    const allowed = [FRONTEND_URL, 'http://localhost:' + NGINX_PORT];
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
});
```

- Restricts cross‑origin requests to the frontend origin and Nginx dev origin.
- Allows credentials (cookies) and standard HTTP methods.

### 2.5 Multipart (file uploads)

```ts
app.register(fastifyMultipart, {
  limits: { fileSize: 1024 * 1024, files: 1 },
});
```

- Enables avatar upload via multipart/form‑data.
- Enforces a 1 MB max file size and one file per request.

### 2.6 Static files

```ts
app.register(fastifyStatic, {
  root: UPLOAD_DIR,
  prefix: '/uploads/',
});
```

- Serves uploaded avatar images at `/uploads/<filename>`.

---

## 3. Health check and migrations

Health:

```ts
app.get('/health', async () => ({ status: 'ok' }));
```

Migrations and maintenance:

```ts
await runMigrations();
const teardownPurgeSchedulers = setupPurgeSchedulers(app);

app.addHook('onClose', async () => {
  teardownPurgeSchedulers();
});
```

- `runMigrations()` ensures the database schema is up to date on startup.
- `setupPurgeSchedulers(app)` installs background tasks (e.g., purging old tokens or data).
- `onClose` hook cleans up schedulers on shutdown.

---

## 4. Route registration

Routes are organized by domain and registered with prefixes:

```ts
app.register(userRoutes, { prefix: '/api/users' });
app.register(friendsRoutes, { prefix: '/api/friends' });
app.register(matchRoutes, { prefix: '/api/matches' });
app.register(tournamentRoutes, { prefix: '/api/tournaments' });
app.register(loginRoutes, { prefix: '/api/login' });
app.register(logoutRoutes, { prefix: '/api/logout' });
app.register(signupRoutes, { prefix: '/api/signup' });
app.register(refreshRoutes, { prefix: '/api/auth' });
app.register(resetPasswordRoutes, { prefix: '/api/reset-password' });
app.register(statusRoutes, { prefix: '/api/status' });
app.register(blockedUsersRoutes, { prefix: '/api/blocked-users' });
```

Each route module:

- Defines schemas for request/response bodies (where relevant).
- Uses pre‑handlers for auth (`authPreHandler`, `matchAuthPreHandler`).
- Implements business logic using DB queries and helpers.

In dev, additional debug routes:

```ts
if (isDev) {
  app.register(debugRoutes, { prefix: '/debug' });
}
```

- Provide internal tools/logs for development only.

---

## 5. Startup and logging

After registering plugins and routes:

```ts
await app.ready();
app.swagger();

app.log.info(
  `Swagger API documentation served at http://localhost:${BACKEND_PORT}/docs`,
);

app.listen({ host: BACKEND_HOST, port: BACKEND_PORT }, function (err) {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
```

- `app.ready()` waits for all plugins to finish initialization.
- `app.swagger()` generates the OpenAPI spec.
- On listen error, the process logs and exits.

Fastify’s logger is used consistently:

- Application logs (`app.log.info`, `app.log.error`) integrate with the global logging pipeline (ECS format in prod).

---

## 6. How to extend the backend

When adding new API functionality:

1. **Create a new route module** under `apps/backend/routes`, or add endpoints to an existing domain route.
2. **Define schemas** (body/query/params) and, if needed, follow existing patterns for validation.
3. **Use pre‑handlers**:
   - `authPreHandler` for user‑authenticated routes.
   - `matchAuthPreHandler` for game‑server‑authenticated routes.
4. **Register the route module** in `index.ts` with an appropriate `prefix`.
5. **Update Swagger schemas** if needed (most are inferred from route definitions).

Keep the common backend patterns (logging, metrics, error handling) intact so the API remains consistent and observable across new endpoints.

