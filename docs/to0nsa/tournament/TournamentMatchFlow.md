# Tournament Match Flow – From Ready Match to MATCH_END

This document zooms in on **individual matches inside a tournament**:

- How a scheduled tournament match becomes a Pong game.
- How tournament context flows through allocator, join tokens, and game server.
- How `MATCH_END` results update the bracket.

It complements:

- `TournamentNetworkFlow.md` – overall tournament journey.
- `TournamentMatchmaking.md` – scheduling and countdown logic.
- `GameNode.md` – game server internals.
- `ResultsAndRanking.md` – how results are reported for tournaments vs casual matches.

---

## 1. From tournament match ready to game creation

The starting point is a **ready tournament match**:

- Backend (via Redis bridge) informs matchmaking that a specific tournament match is ready.
- `handleTournamentMatchesReady` in `scheduledMatches.ts` receives:
  - `tournamentId`
  - `matches: TournamentMatchesReadyMessage['matches']`

`handleSingleTournamentMatch` is called per match and handles:

- Availability checks.
- Countdown setup.
- Eventually, **match creation** via `createMatch(…, mode, { tournament })`.

The key steps are:

1. Players must be connected to `/matchmaking` with active tournament membership.
2. Both players must be available at countdown time.
3. The countdown completes and `finalizeTournamentMatchLaunch` is called.
4. `createMatch` is invoked with tournament context (`TournamentContext`).

---

## 2. Passing tournament context to allocator and join tokens

When `finalizeTournamentMatchLaunch` decides to start the match, it calls:

- `createMatch(a, b, mode, { tournament })`
  - `mode` is typically `'ranked'` for tournament matches (so ranking rules may apply).
  - `tournament` includes:
    - `tournamentId`
    - `tournamentMatchId`
    - `stage` (`semifinal`, `final`, `bronze`)

Inside `createMatch` (`apps/matchmaking/utils/queue.ts`):

- A `matchId` is created (uuid).
- `randomSeed` and `simulationStartTick` are computed.
- `axios.post` to allocator:

```ts
await axios.post(`${ALLOCATOR_URL}/allocate`, {
  idempotencyKey: matchId,
  mode, // 'ranked' or 'invite', but with tournament: TournamentContext
  players: [
    { playerIdentifier: a.uuid, side: 'west', alias: a.username, mmr: a.mmr },
    { playerIdentifier: b.uuid, side: 'east', alias: b.username, mmr: b.mmr },
  ],
  randomSeed,
  simulationStartTick,
  tournament: { tournamentId, tournamentMatchId, stage },
});
```

Allocator:

- Registers a room on a chosen game node.
- Creates **join tokens** (`JoinTokenClaims`):
  - Include `roomIdentifier`, `sub` (userUuid), `side`, `simulationStartTick`.
  - Merge in `TournamentContext` fields where applicable.
- Writes `room-to-node` mapping in Redis.
- Returns:
  - `roomIdentifier`
  - `endpointUrl` (gateway path under `/g/:roomId`)
  - `perPlayerJoinTokens` keyed by player UUID.

Matchmaking then sends a `HANDOFF` message to each player, including:

- `tournament: TournamentContext` field.

This ensures:

- All downstream components (gateway, game node, result reporter) know this match belongs to a specific tournament and bracket match.

---

## 3. Client handoff and connecting to the game

On the frontend:

- Tournament controllers see a `HANDOFF` message of type `HandoffMessage` (from `protocol/net.ts`).
- `routeMessage` sets an `ActiveHandoff` object in the tournament reducer:
  - Contains `matchId`, `roomIdentifier`, `gameServerWSUrl`, `joinToken`, `randomSeed`, `side`.
  - Tournament metadata is implicitly tied via the message (and used for display/logging).
- `useMatchLifecycle`:
  - Observes `handoff` and `matchPhase`.
  - When `handoff` is set and `matchPhase` is `'starting'`:
    - Bootstraps the **same online Pong host** as used for casual games:
      - Calls `connectOnline` with:
        - `serverUrl = gameServerWSUrl`.
        - `roomIdentifier`, `joinToken`, `seat` derived from `side`.
      - Connects to `/g/:roomId` using `Sec-WebSocket-Protocol: bearer,<joinToken>`.

Gateway and game node behavior:

- Gateway:
  - Validates join token, including tournament fields and `roomIdentifier`.
  - Proxies the WebSocket to the appropriate game node.
- Game node:
  - Verifies join token again.
  - Creates or attaches a `MatchSession` for this `roomIdentifier`.
  - Stores tournament context in `reservation` / `model` (so `ResultReporter` can report into the correct tournament endpoints).

From this point on:

- The match behaves like any other **online match**:
  - `ROOM_STATE` and `START`.
  - `FRAME` messages with tick index and game state.
  - `RESUME_TOKEN` for reconnects.
  - `MATCH_END` when play finishes.

---

## 4. Tournament‑aware behavior in the game server

Game server components relevant for tournaments:

- `RoomRegistry` and `RoomReservation`:
  - `RoomReservation` includes optional `tournament` context attached at room registration time by the allocator/game‑server HTTP bridge.
- `MatchModel`:
  - Stores tournament flags so reconnect policies and result reporter can differentiate between casual and tournament matches.
- `ReconnectManager`:
  - Uses `reconnectGraceMs(true, cfg)` when `session.reservation.tournament` is set, providing:
    - Larger reconnect windows for tournament matches (e.g., 10 seconds).
  - This affects:
    - Disconnect grace timers.
    - `OPPONENT_DISCONNECTED` grace periods.
    - Whether a disconnect eventually leads to an opponent timeout or forfeit result.
- `ResultReporter`:
  - Special‑cases matches with tournament context:
    - Uses `reportTournament` instead of `reportOnlineMatch` for those sessions.
    - Includes `tournamentId`, `tournamentMatchId`, and `stage` in the payload.

The server logic for physics, ticks, frames, and latency (see `OnlinePongDataPlane.md`) is otherwise identical between casual and tournament modes.

---

## 5. MATCH_END and tournament result reporting

When the game ends (natural conclusion, forfeit, timeout, error):

- Game node determines:
  - Winner (`east` / `west`).
  - Reason (`completed`, `forfeit`, `opponent_timeout`, `error`).
  - Detailed `OnlineMatchSummary` (games history, scores, mmr changes).

For tournament matches:

- `ResultReporter.reportTournament(roomIdentifier, token, reservation, east, west, payload)`:
  - Calls backend tournament match result endpoints, typically:
    - `POST /api/tournaments/:tournamentId/matches/:tournamentMatchId/result` with:
      - Winner side (mapped to participant/team).
      - Scores per team.
      - Additional metadata (mmr deltas, etc.).
  - Backend:
    - Persists the Pong match result in the generic matches table.
    - Updates the tournament match row with `matchId` and `completedAt`.
    - Advances the winner to the next round when appropriate.

Meanwhile, `Broadcaster.notifyMatchEnd`:

- Sends a `MATCH_END` message to both players:
  - `reason` (e.g., `'completed'`, `'forfeit'`, `'opponent_timeout'`, `'error'`).
  - `winner` (`east` or `west`).
  - `summary` (`OnlineMatchSummary`), same shape as casual matches.

On the frontend:

- `useMatchLifecycle`:
  - Shows appropriate post‑match feedback (snackbar, overlays).
  - Clears the active handoff and match phase.
  - Invokes `refreshTournamentState` to pull the latest bracket and lobby from backend via matchmaking’s sync.

Matchmaking’s `handleTournamentStateUpdated` (or `handleTournamentMatchesReady` + `requestTournamentSync`) then:

- Triggers a state sync:
  - Broadcasting `TOURNAMENT_LOBBY_UPDATED` and `TOURNAMENT_BRACKET_SNAPSHOT`.

This closes the loop:

- Players see:
  - Their match result in the bracket.
  - Their progression (advance or elimination).

---

## 6. Reconnects and resuming tournament matches

Tournament reconnects follow the same mechanisms described in `OnlinePongReconnect.md`, with tournament‑specific details:

- Resume tokens issued by the game node include the same `roomIdentifier` / session info; tournament context is implicitly tied to the room via `MatchSession`.
- Matchmaking’s tournament code:
  - Tracks membership via `restoreTournamentMembership`.
  - Ensures that players rejoining `/matchmaking` receive updated `TOURNAMENT_*` state and re‑notification of pending matches.

On the frontend:

- `useTournamentPageController`:
  - Contains an auto‑resume effect:
    - If on `/pong/tournaments/:id` with an active, non‑completed tournament.
    - And a tournament‑scoped resume token exists (for that tournament).
    - And no handoff / match is already in progress.
    - Then seeds a synthetic `ActiveHandoff` (`matchId: 'resume'`, `roomIdentifier`, `gameServerWSUrl: /g/:roomId`) and sets `matchPhase` to `'starting'`.
  - The online host then connects using the resume token and continues where it left off.

Disconnects and reconnects at the **matchmaking/tournament** layer (before or between matches) are handled by:

- `handleClientDisconnectFromTournament` (cancels countdowns and schedules reminders).
- `restoreTournamentMembership` (restores tournament state and pending matches when reconnecting).

---

## 7. Mental model

You can think of a tournament match as:

- A normal **online match** with:
  - Extra context (tournamentId, tournamentMatchId, stage).
  - Longer reconnect grace.
  - Different result path (into tournament APIs and bracket).

The flow is:

1. Backend + matchmaking decide that a specific tournament bracket match is ready.
2. Matchmaking:
   - Ensures both players are present.
   - Runs countdown and absence logic.
   - Calls allocator with tournament context.
3. Allocator and game node:
   - Create the Pong match and join tokens, carrying tournament context down to the game server.
4. Frontend:
   - Receives `HANDOFF`, bootstraps online Pong via the existing host, plays out the game.
5. Game server:
   - Emits `MATCH_END`, calls tournament result endpoints.
6. Matchmaking + backend:
   - Sync updated tournament state back to clients via `TOURNAMENT_*` messages.

When working on tournament features, always remember:

- **Control plane** (scheduling, brackets, absences) lives mostly in backend + matchmaking.
- **Data plane** (frames, ticks, reconnect) is shared with online Pong and fully described in `OnlinePongDataPlane.md` and `OnlinePongReconnect.md`.

