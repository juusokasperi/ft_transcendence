# Online Pong Workflow – Overview & Reading Guide

This folder explains how **online Pong** works end‑to‑end, from the browser and React app to matchmaking, game servers, deployment, and monitoring.

If you read only one document first, start with:

- `OnlinePongNetwork.md` – high‑level user journey and network workflow.
- `OnlinePongInterviewSummary.md` – compact, interview‑style summary of architecture, control plane, data plane, tokens, reconnects, and failure modes.

The rest of this file is an index and short summary of the other docs so you can pick what to read next based on what you’re working on.

---

## 1. Browser & Frontend

- `browser.md`  
  Browser‑centric view: DOM, canvas/WebGL, event loop, HTTP and WebSocket usage in this project, localStorage and resume tokens, and how to debug online Pong in DevTools.

- `OnlinePongNetwork.md`  
  Step‑by‑step from `/pong/online` to match end and resume:
  - How the React page, hooks, and state machine work.
  - How the matchmaking WebSocket is used.
  - How the client consumes `HANDOFF`, connects through the gateway, runs the online host, and handles `MATCH_END` and resume.

- (Outside this folder) `docs/to0nsa/react/React.md`  
  React basics tailored to this codebase (components, context, hooks) that help when reading the frontend parts referenced above.

---

## 2. Matchmaking, Allocator, and Game Server

- `MatchmakingService.md`  
  The **matchmaking control plane**:
  - WebSocket endpoint `/matchmaking` and client states.
  - Queues, pairing, pending matches, tournaments, and invite lobbies.
  - How it talks to Allocator and the game nodes, and how `HANDOFF` messages are built.

- `AllocatorAndScorer.md`  
  The **placement layer** between matchmaking and game nodes:
  - Allocator: `/allocate` endpoint, idempotency keys, reading scores from Redis, calling game servers to create rooms, and minting join tokens.
  - Scorer: reading Prometheus / `/metrics`, calculating node scores, and writing `game-node:scores` that Allocator uses.

- `GameNode.md`  
  The **game server** (Game Node) that actually runs Pong:
  - Room lifecycle: reservation from Allocator, starting sessions, and joining via WebSocket.
  - Deterministic simulation using `@pong/game-logic`.
  - Handling player input, tick loop, `FRAME` messages, disconnects, reconnects, and resume tokens.
  - How and when results are produced and reported.

- `OnlinePongDataPlane.md`  
  The **data plane** for online Pong:
  - How the game‑server tick loop works and how `FRAME` packets are built.
  - How clients consume `FRAME`, `ROOM_STATE`, and `START` to stay in sync.
  - How latency is measured with `ping`/`PONG`, smoothed, and tied to reconnect grace windows.

- `OnlinePongReconnect.md`  
  Reconnect and resume behavior:
  - How resume tokens are rotated, stored, and consumed.
  - How the frontend reconnector (`createReconnector`) behaves (backoff, when it gives up, permanent vs recoverable closes).
  - How disconnect → grace window → resume → forfeit flows map to `OPPONENT_*` / `MATCH_END` messages and UI states.

---

## 3. Gateway, Tokens, and Security

- `GatewayAndWebSockets.md`  
  The **game gateway** on `/g/:roomId` and WebSocket usage across services:
  - How it validates join/resume tokens from subprotocols.
  - How it looks up `room-to-node` in Redis and proxies to the right game node.
  - How matchmaking, game, and chat WebSockets fit together.

- `SecurityAndTokens.md`  
  End‑to‑end **token story**:
  - Site auth: backend JWTs and cookies (access/refresh).
  - Matchmaking auth: using the site token to authenticate clients and fetch MMR.
  - Join tokens: Allocator → gateway → game server.
  - Resume tokens: game server → client → gateway → game server.
  - Chat auth: reusing the site token for `/chat`.

- `ProtocolReference.md`  
  Wire‑protocol reference:
  - Enumerates all matchmaking messages and client commands.
  - Enumerates all game‑server control messages and close codes.
  - Describes who sends each message, when, and how the other side reacts.

- `FailureModesAndUX.md`  
  Consolidated error/failure flows:
  - For each layer (matchmaking, allocator, gateway, game server, tournaments), lists WS close codes, `ERROR` codes, and HTTP failures.
  - Describes what the browser sees and how the frontend responds (snackbars, state transitions, retries).

---

## 4. Backend, Results, and Rankings

- `BackendAndAPIs.md`  
  Backend‑centric view:
  - How login and JWTs work (cookies, `authPreHandler`).
  - Where user, friends/blocked, match, and tournament routes live.
  - How match and stats endpoints are protected and consumed by the game server.

- `ResultsAndRanking.md`  
  How match results become persisted data and ELO:
  - Game server `ResultReporter`: building `OnlineMatchSummary`, computing scores, and deciding winners (natural vs technical).
  - Reporting casual vs tournament matches.
  - Backend routes that store matches, per‑player stats, and update rankings.

---

## 5. Chat, Invites, Deployment, and Observability

- `ChatAndPresence.md`  
  Real‑time chat and presence:
  - `/chat` WebSocket, RealtimeSocketContext, and chat UI.
  - User lists, presence, blocked users.
  - Game invites started from chat and how they reach matchmaking for invite‑based matches.

- `InviteMatchFlow.md`  
  End‑to‑end invite‑based 1v1 flow:
  - From `/chat` messages (`inviteUser`, `acceptInvite`) to the matchmaking `/invite-match` HTTP endpoint.
  - How invite lobbies work in matchmaking and how they turn into `HANDOFF` messages.
  - Differences vs ranked queue (states, timeouts, error cases) while still using the same allocator/game‑server pipeline.

- (Outside this folder) `docs/to0nsa/tournament/overview.md`  
  Tournament‑centric docs:
  - `TournamentNetworkFlow.md` for “join tournament → scheduled match → MATCH_END → bracket update”.
  - `TournamentFrontend.md` and `TournamentMatchmaking.md` for frontend hooks and matchmaking internals.
  - `TournamentMatchFlow.md` for how individual tournament matches become games on `/g/:roomId` and feed back into the bracket.

- `DeploymentOnlinePong.md`  
  How everything is deployed with Docker:
  - Dev vs prod compose files.
  - Service list (frontend, backend, matchmaking, allocator, game‑server, game‑gateway, chat, Redis, scorer, nginx).
  - Network topologies and how traffic flows via Nginx and internal bridges.

- `MonitoringAndObservability.md`  
  Metrics, logs, and dashboards:
  - How `@utils/metrics` exposes `/metrics` for each service.
  - Prometheus, cAdvisor, Nginx exporter, and Alertmanager.
  - Grafana dashboards and ELK (Logstash, Elasticsearch, Kibana) for logs.

---

## 6. Suggested Reading Paths

Depending on what you’re trying to do, you can use different paths through these docs.

- **Frontend‑heavy (React + client networking)**
  1. `browser.md`
  2. `OnlinePongNetwork.md`
  3. `OnlinePongDataPlane.md`
  4. `MatchmakingService.md` (sections about client messages)
  5. `SecurityAndTokens.md` (join/resume token overview)

- **Backend/matchmaking/game‑server**
  1. `BackendAndAPIs.md`
  2. `MatchmakingService.md`
  3. `AllocatorAndScorer.md`
  4. `GatewayAndWebSockets.md`
  5. `GameNode.md`
  6. `OnlinePongDataPlane.md`
  7. `ResultsAndRanking.md` and `SecurityAndTokens.md`

- **Infra/ops (deploy, debug, monitor)**
  1. `DeploymentOnlinePong.md`
  2. `MonitoringAndObservability.md`
  3. `GatewayAndWebSockets.md` and `AllocatorAndScorer.md`
  4. `GameNode.md` (for interpreting game‑server metrics and logs)

Use this overview as a map: when you encounter a concept in code (e.g., join tokens, `/g/:roomId`, `ResultReporter`, `/matchmaking`), you can jump directly to the matching doc here to get the bigger picture.
