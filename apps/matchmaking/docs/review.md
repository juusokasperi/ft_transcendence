# Matchmaking Code Review – `apps/matchmaking`

> Snapshot taken on 2025‑12‑12, based on the current implementation of the matchmaking service.

This document focuses on observations, risks, and improvement ideas for matchmaking. For a high‑level architectural description of flows and integration points, see `overview.md` in the same folder.

---

## 1. Strengths

- **Clear service boundaries**
  - Matchmaking stays in the control plane: pairing players, orchestrating tournaments, and handing off to game nodes.
  - Simulation and reconnect physics are delegated to `apps/game-server`; WS routing is delegated to `apps/game-gateway`.

- **Readable end‑to‑end flows**
  - `index.ts` makes the lifecycle easy to follow:
    - authenticate WS clients,
    - restore tournament membership,
    - dispatch protocol messages to the right subsystem,
    - clean up on close.
  - The three main flows are split into dedicated modules:
    - ranked queue matching: `utils/queue.ts`
    - invite matches: `utils/invites.ts`
    - tournament orchestration: `utils/scheduledMatches.ts`

- **Pragmatic state machine**
  - `ClientState` + `setClientState` (`utils/state.ts`) provide an explicit server‑side state machine to enforce WS invariants and make logs actionable.

- **Tournament logic is robust**
  - `scheduledMatches.ts` handles many real‑world cases:
    - countdowns that auto‑start when both players are present,
    - reminders for offline users,
    - absence auto‑wins via backend `auto-forfeit`,
    - full snapshot sync to keep brackets/lobbies consistent.
  - The use of Redis Streams + backend snapshots gives a clear source of truth.

- **Correct use of shared protocol and token contracts**
  - Uses shared WS message types and join token semantics:
    - allocator‑minted join tokens (`iss: 'mm'`, `aud: 'game-node'`)
    - tournament context forwarded consistently to allocator and clients.

---

## 2. Potential issues / things to watch

- **Heavy reliance on in‑memory state**
  - Ranked buckets, pending match offers, invite lobbies, countdown timers, and subscribers are all process‑local.
  - A matchmaking restart:
    - drops the ranked queue (players must rejoin),
    - cancels invite lobbies silently,
    - clears pending tournament reminders/countdowns (recovered via Redis events + reconnect).
  - This is a valid design choice for a student project, but it’s worth calling out as an operational trade‑off.

- **Timeout policies are split across services**
  - Several critical timings are hard‑coded or live in different places:
    - accept window in `queue.ts` (15s),
    - handoff join timeout in `pendingHandoffs.ts` (15s),
    - join deadline in allocator (15s),
    - `simulationStartTick = Date.now() + 5000` in matchmaking.
  - If any of these values change independently, you can get subtle UX issues (e.g., clients told to start at time T but join window already expired).

- **Limited test coverage outside tournaments**
  - Current tests focus on tournament scheduling and bridge behavior.
  - There are no tests for:
    - ranked bucket pairing fairness / widening window,
    - accept/decline edge cases,
    - allocator failure paths,
    - invite lobbies and their cancellation rules,
    - pending handoff rollback logic,
    - rate limiting behavior.
  - Given matchmaking sits on the critical “start a game” path, a small amount of coverage here would pay off.

- **Coupling via shared helpers inside ranked module**
  - `createMatch(...)` lives in `queue.ts` but is also called by:
    - invite matches,
    - tournament scheduled matches.
  - The function is well‑factored, but the location can make `queue.ts` feel like a “shared utilities” file rather than purely ranked logic, and increases accidental coupling risk over time.

- **Backend API coupling without strong typing**
  - `scheduledMatches.ts` fetches and merges multiple backend endpoints and relies on their shapes with light runtime checks.
  - If backend tournament APIs evolve, breakage would likely show up at runtime.

- **Potential performance ceilings at high concurrency**
  - The ranked ticker runs every 500ms and may scan multiple buckets and candidates.
  - Redis token bucket checks run per incoming WS message.
  - For current scale this is fine, but if player counts grow, profiling may show:
    - the bucket scan needing optimization,
    - or Redis rate limiting becoming a bottleneck.

---

## 3. Possible improvements / refactors

- **Make timing policies explicit and shared**
  - Move the accept window, handoff timeout, and any “start delay” constants into `utils/config.ts` and reference them consistently.
  - Consider documenting a single timing diagram in `docs/to0nsa/workflow/FailureModesAndUX.md` / tournament docs so frontend expectations stay aligned.

- **Clarify tournament vs ranked ownership (two viable directions)**
  - The current file split (`queue.ts` vs `scheduledMatches.ts`) separates concerns, but the service can still feel like “ranked matchmaking + tournament scheduler” in one process. If you want a cleaner mental model and maintenance surface, there are two options:

  - **Keep one matchmaking service, but isolate subsystems harder**
    - Extract the allocator handoff into a shared `utils/handoff.ts` (or a small `HandoffService`) that owns:
      - the allocator `POST /allocate` call,
      - `HANDOFF` payload construction,
      - pending‑handoff registration / rollback.
    - Then rename to make responsibilities explicit:
      - `utils/queue.ts` → `utils/rankedQueue.ts` (pure ranked pairing + accept/decline),
      - `utils/scheduledMatches.ts` → `utils/tournamentOrchestration.ts`,
      - `utils/handoff.ts` becomes the shared allocator/handoff layer.
    - This “better rename + tiny refactor” matches the actual ownership 1:1 and reduces accidental coupling without adding new infra.

- **Strengthen backend API typing**
  - Define shared DTO types for tournament endpoints (or generate them from backend schema) and use them in:
    - `fetchTournamentState`,
    - participant/status checks,
    - match/player payload joins.
  - Even a small `zod` schema at the boundary would prevent silent shape drift.

- **Add focused unit tests**
  - Ranked queue:
    - pairing within buckets and across widening window,
    - fairness (oldest‑first) invariants,
    - accept/decline + timeout behavior.
  - Invite flow:
    - lobby creation, join order, timeout destruction,
    - tournament‑membership cancellation.
  - Handoff rollback:
    - allocator error path,
    - join timeout paths per mode.
  - These can all be tested without spinning up a real Fastify server by using existing Vitest patterns.

- **Add matchmaking‑specific metrics**
  - Build on `registerMetrics` with low‑cardinality counters like:
    - `matchmaking_queue_pairs_total`
    - `matchmaking_allocator_failures_total`
    - `matchmaking_handoff_timeouts_total{mode="ranked|invite|tournament"}`
    - `matchmaking_tournament_countdowns_started_total`
  - This would make production diagnosis much faster than log‑only visibility.

- **Consider performance optimizations only if needed**
  - If profiling shows the bucket scan is hot:
    - track oldest players in a small priority list rather than recomputing each tick,
    - or increase tick interval adaptively based on queue size.
  - If Redis rate limiting is hot:
    - debounce client input on the WS layer,
    - or tune token bucket parameters so compliant clients rarely touch Redis.

Overall, the matchmaking service is solid, readable, and already nicely split into ranked / invite / tournament subsystems. The highest‑value next steps are to **centralize timing policies**, **tighten the tournament vs ranked boundary via a shared handoff module**, and add a small set of tests for the ranked and invite paths.
