# Game Server Code Review – `apps/game-server`

> Snapshot taken on 2025‑12‑11, based on the current implementation of the game server (`apps/game-server`).

This document focuses on observations, risks, and improvement ideas for the game server. For a high‑level overview of architecture and responsibilities, see `overview.md` in the same folder.

---

## Observations & Possible Improvements

Overall, the game server code is **well structured** and close to production‑ready, but there are a few areas to watch and possible refinements.

### Strengths

- **Separation of concerns** is clear:
  - Domain (match model & types) vs application services (registry, runner, reconnect, tokens, reporter) vs infra (HTTP & WS).
- **Good reuse of shared packages**:
  - `@pong/game-logic` for the core simulation.
  - `@pong/shared` for protocol and token types.
  - `@utils/*` for logging, metrics, and rate limiting.
- **Reconnect / resume is thoughtfully designed**:
  - Single‑use resume tokens in Redis.
  - Grace periods that differ for casual vs tournament.
  - Rotation logic coupled to the active connection to avoid stale intervals.
- **Result reporting is explicit**:
  - Separate tournament vs casual paths.
  - Clear payloads to backend APIs.
  - Technical‑win logic to make disconnect/timeout results coherent for players.

### Potential issues / things to watch

- **Forfeit logic fragmented across layers**:
  - Forfeits can be triggered:
    - Explicitly via `forfeit` WS messages in `WSServer.handleMessage`.
    - Via reconnect grace expiry in `ReconnectManager`.
    - Via “double‑quit” fallback in `WSServer.handleClose` (last quitter wins).
  - Each path:
    - Stops the runner.
    - Calls `ResultReporter.report`.
    - Sends `MATCH_END`.
    - Performs its own socket closing / `RoomRegistry.clearSession`.
  - This duplication makes the logic harder to reason about and increases the chance of subtle divergence (e.g., different reasons/winners, or slightly different cleanup order).

- **Heavy use of `any` and defensive casts around `playerAtEnd`**:
  - Several places use `(session.model.state as any)?.playerAtEnd` when deriving `winnerSide`.
  - If `playerAtEnd` is missing or inconsistent, we silently fall back or still proceed, which may produce “wrong but non‑crashing” results in rare edge cases (e.g., early forfeits, test setups).
  - Tighter typing or helper utilities for “map seat ↔ side using final mapping” would reduce this risk.

- **Error handling sometimes swallows information**:
  - There are many nested `try { ... } catch {}` blocks that intentionally ignore errors while closing sockets or cleaning up.
  - This is okay for UX (we don’t want crashes while cleaning up), but it can hide real bugs:
    - e.g., if `RoomRegistry.clearSession` throws systematically, we would only see the outer log once (if at all).
  - A small pattern like “log on first failure, then ignore” or centralizing cleanup into a helper could make this safer.

- **Redis interaction assumptions**:
  - Join token single‑use relies on the **gateway** writing `join-token:<jti>` with `SET ... NX`, and the game server only checking `EXISTS`:
    - If gateway behavior ever changes, the game server’s “exists” check alone would not enforce single use.
  - This is documented in `docs/tokens.md`, but the coupling is implicit in code; a short comment near the `EXISTS` call already helps, but stronger invariants or a shared helper could further reduce drift.

- **Complexity of `ResultReporter.report`**:
  - The method is quite long and mixes:
    - Player resolution (east/west mapping).
    - Technical win handling.
    - Tournament vs casual branching.
    - Best‑of inference and summary construction.
  - It’s correct and well commented, but future modifications (e.g., new game modes or scoring rules) will be tricky without splitting into smaller helpers (e.g., “compute final scores”, “build technical games history”, “build summary from scores + deltas”).

- **Subtle timing interactions**:
  - Multiple timers interact:
    - Match start timeout (`scheduleStart` / `startMatch`).
    - Tick interval.
    - Reconnect grace timeout (`ReconnectManager`).
    - Resume‑token rotation interval (`bindPlayerConnection`).
  - In most cases, these are carefully cancelled before re‑scheduling, but this relies on convention:
    - e.g., `MatchModel.setStartTimeout` always cancels previous timeouts, `cancelDisconnectGrace` calls its own cancel function, and `bindPlayerConnection` clears any existing interval before installing a new one.
  - If future features add more timers, it will be important to keep this discipline and maybe centralize “timer lifecycle” helpers.

### Possible improvements / refactors

- **Clarify tournament vs casual responsibilities via a “match mode” abstraction**:
  - Keep a single game‑server service, but:
    - Make “match kind” (`casual` vs `tournament`) an explicit context object on the session.
    - Factor tournament‑specific behavior into isolated modules, e.g.:
      - `CasualResultReporter` vs `TournamentResultReporter`, or
      - a `MatchModePolicy` that supplies:
        - reconnect grace window,
        - best‑of / technical‑win rules,
        - result‑reporting implementation.
  - This keeps the simulation, reconnect code, and WS protocol shared, while making mode‑specific behavior explicit and easier to extend if new modes appear.

- **Tighten a few performance hot spots (once behavior is stable)**:
  - Per‑tick work is already lean (intent resolution → `stepOnce` → `broadcastFrame`), but it’s still worth profiling:
    - Confirm that `stepOnce` + `MatchModel.applyStep` dominate CPU, not logging or JSON work.
    - Ensure `broadcastFrame` doesn’t accidentally allocate large intermediate objects per seat beyond what’s needed.
  - Redis round‑trips are on the critical path for:
    - Rate limiting (`RedisTokenBucket.consume` on every input message).
    - Join token reuse checks (`EXISTS join-token:<jti>`).
    - These are necessary for safety, but you could:
      - Tune token bucket parameters so well‑behaved clients rarely touch Redis.
      - Consider light in‑memory smoothing (e.g., local debounce) before calling the bucket, if profiling shows Redis as a bottleneck.
  - `ResultReporter.reportCasual` currently runs several separate `reduce`/`filter` passes over `gamesHistory`:
    - This is not on a hot path (once per match), but if matches become very long, combining those passes into a single reduce would cut some allocations and CPU without changing behavior.

- **Centralize forfeit and match‑end orchestration**:
  - Introduce a small “MatchEndService” or helper that:
    - Takes `session`, `{ winnerSide, reason }`, and a source (`timeout`, `explicit-forfeit`, `double-quit`, `natural`).
    - Internally:
      - Stops the runner.
      - Calls `ResultReporter.report`.
      - Broadcasts `MATCH_END`.
      - Closes sockets and clears the session.
  - `ReconnectManager` and `WSServer` would then call this helper instead of each running their own mini‑flows.

- **Extract scoring / technical‑win logic from `ResultReporter`**:
  - Move the “how many games, who wins which, how to synthesize technical games” into a pure function in a separate module.
  - This would:
    - Make the logic easier to unit test in isolation.
    - Allow reuse if another service ever needs to reason about scores.

- **Expand integration tests around end‑to‑end flows**:
  - Add WS‑level tests (possibly using a real `WSServer` bound on an ephemeral port) that cover:
    - Happy path: join → start → a few FRAMEs → MATCH_END (natural).
    - Disconnect / reconnect within grace → match resumes and ends normally.
    - Disconnect beyond grace → opponent_timeout → MATCH_END.
    - Explicit `forfeit` messages and double‑quit fallback.
  - This would give high confidence when refactoring reconnect or forfeit flows.

- **Strengthen config validation and invariants**:
  - Add simple guards like:
    - `tickHz > 0`.
    - `minStartDelayMs >= 0`.
    - `lagCompensationMs >= 0` and not “too large” relative to tick rate.
  - Optionally log effective configuration at startup in a structured way to make debugging misconfigurations easier in prod.

- **Reduce `any` and tighten types around state mappings**:
  - Introduce small helper types/functions for:
    - “Get final seat → side mapping from model.state”.
    - “Map side winner to seat winner and player‑space winner”.
  - Replace `(model.state as any)?.playerAtEnd` with these helpers to catch mismatches at compile time.

These are not urgent changes, but they are the kinds of refinements that would make the game server even easier to maintain and reason about, especially as new game modes or tournament formats are added.
