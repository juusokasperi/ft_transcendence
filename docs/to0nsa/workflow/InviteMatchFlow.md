# Invite‑Based Match Flow – Chat → Matchmaking → Game

This document explains the **invite‑based 1v1 flow**, starting from `/chat` WebSocket messages and ending at the game WebSocket on `/g/:roomId`.

It complements:

- `ChatAndPresence.md` – chat protocol, presence, and how invites are initiated.
- `MatchmakingService.md` – matchmaking internals and invite lobbies.
- `OnlinePongNetwork.md` – generic online match flow.
- `AllocatorAndScorer.md` – how rooms and join tokens are created.
- `GatewayAndWebSockets.md` – how `/g/:roomId` connections are admitted and routed.
- `OnlinePongReconnect.md` – reconnect/resume behavior (also applies to invite matches).

The goal is to show how an invite travels from **chat** through **matchmaking** to a **game node**, and how this differs from a normal ranked queue match.

---

## 1. Big picture

Main components:

- **Chat service** (`apps/chat`):
  - WebSocket `/chat`.
  - Handles `inviteUser`, `acceptInvite`, `inviteGame`, `inviteAccepted`, etc.
  - Calls **matchmaking** over HTTP to validate and create invite lobbies (`/invite-match`).

- **Matchmaking service** (`apps/matchmaking`):
  - Exposes `POST /invite-match` (HTTP) via `inviteRoute`.
  - Tracks **invite lobbies** and maps them to matchmaking `ClientInfo` instances.
  - When both invited players connect to `/matchmaking`, it calls `createMatch(..., mode: 'invite')`, which:
    - Talks to **Allocator**.
    - Sends `HANDOFF` messages directly over `/matchmaking` WebSocket.

- **Allocator + Game Node + Gateway**:
  - Same as ranked queue:
    - Allocator registers a room on a game node and returns join tokens.
    - Gateway exposes `/g/:roomId` and validates join tokens.
    - Game node runs the match and emits `FRAME` / `MATCH_END` etc.

Differences from ranked queue:

- Players are **explicitly chosen** (inviter + invitee) rather than taken from a rating bucket.
- There is an **invite lobby** state in matchmaking instead of the normal queue.
- Failure modes and user messages are tailored around availability and lobby timeouts.

---

## 2. Chat side – invitations over `/chat`

Frontend chat uses `RealtimeSocketContext` to send and receive chat messages; invites are just another message type.

### 2.1 Sending an invite (`inviteUser`)

In the frontend chat UI (see `ChatAndPresence.md` for details):

- User A clicks “Invite to game” on user B.
- Chat sends a JSON message over `/chat`:

```jsonc
{ "type": "inviteUser", "target": "<username>" }
```

`handleInviteUser` (`apps/chat/handlers/handleInvite.ts`) runs:

- Validations:
  - Inviter has a username set (already did `setName`).
  - Target exists in current channel.
  - Not inviting self.
  - Target has not blocked inviter.
  - There is no existing pending invite from A → B.
- Calls `checkInviteAvailability` (`apps/chat/utils/invite.ts`), which sends:

```http
POST {MM_SERVICE_URL}/invite-match?validateOnly=true
Content-Type: application/json

{ "player1Uuid": inviter.uuid, "player2Uuid": invitee.uuid }
```

If matchmaking responds with `status: 'SUCCESS'`:

- Chat creates a `PendingInvite` with:
  - `fromUserUuid`, `fromUsername`
  - `toUserUuid`, `toUsername`
  - `createdAt`
- Sends:
  - To invitee: `{ type: 'inviteGame', inviteId, from, fromUserUuid }`
  - To inviter: `{ type: 'inviteSent', inviteId, to }`

If matchmaking returns `INVITER_UNAVAILABLE` / `INVITEE_UNAVAILABLE` / `ERROR`:

- Chat sends an `error` message back to the inviter with an appropriate explanation.

### 2.2 Accepting or declining (`acceptInvite` / `declineInvite`)

When the invitee interacts with the invite UI:

- **Accept**:

```jsonc
{ "type": "acceptInvite", "inviteId": "<inviteId>" }
```

`handleAcceptInvite` (`apps/chat/handlers/handleInvite.ts`):

- Looks up `PendingInvite` by `inviteId`.
- Ensures:
  - Invite exists and `invite.toUserUuid === client.uuid`.
  - Inviter is still connected.
- Logs the acceptance and calls `createInviteMatch`:

```ts
const result = await createInviteMatch(invite.fromUserUuid, invite.toUserUuid, log);
```

`createInviteMatch` (`apps/chat/utils/invite.ts`):

- Sends an HTTP `POST` to `${MM_SERVICE_URL}/invite-match`:

```http
POST /invite-match
Content-Type: application/json

{ "player1Uuid": fromUserUuid, "player2Uuid": toUserUuid }
```

- Returns `{ status: 'SUCCESS' | 'INVITER_UNAVAILABLE' | 'INVITEE_UNAVAILABLE' | 'ERROR', message? }`.

On `SUCCESS`:

- Both inviter and invitee get `{ type: 'inviteAccepted' }` over `/chat`.
- All other pending invites from the inviter are cancelled with `inviteCancelled` messages.

On failure:

- Invitee gets an `error` message (`inviter unavailable`, `already in a match/tournament`, etc.).
- Pending invite is removed.

- **Decline**:

```jsonc
{ "type": "declineInvite", "inviteId": "<inviteId>" }
```

`handleDeclineInvite`:

- Sends `{ type: 'inviteDeclined' }` to both inviter and invitee.
- Deletes the pending invite.

### 2.3 Invite expiry and cleanup

`cleanupExpiredInvites` (`apps/chat/utils/invite.ts`):

- Runs periodically (every 10s).
- For invites older than `INVITE_TIMEOUT_MS` (60s):
  - Sends `{ type: 'inviteExpired', username: otherUsername }` to both sides.
  - Removes the invite.

From the chat client’s POV:

- Invites are **ephemeral**.
- Matchmaking availability is always revalidated before an invite turns into an actual match.

---

## 3. Matchmaking HTTP endpoint – `/invite-match`

The matchmaking service exposes an HTTP route for chat to create (or validate) invite matches.

### 3.1 Route and validation

`inviteRoute` (`apps/matchmaking/utils/invites.ts`) is mounted under `/invite-match` in `apps/matchmaking/index.ts`:

```ts
await app.register(inviteRoute, { prefix: '/invite-match', getClientByUuid });
```

Request shape:

- Body: `{ player1Uuid: string; player2Uuid: string }`
- Query: `{ validateOnly?: string }`

`validateInviteRequest` enforces:

- Neither player is already in an invite lobby:
  - Returns `INVITER_UNAVAILABLE` / `INVITEE_UNAVAILABLE` if so.
- Neither player is in a tournament (current or from `ClientInfo.state`):
  - Similarly returns `INVITER_UNAVAILABLE` / `INVITEE_UNAVAILABLE`.

On **validate‑only** (`?validateOnly=true`):

- If validation passes:
  - Responds `{ status: 'SUCCESS' }`.
- Otherwise:
  - Responds `{ status: 'INVITER_UNAVAILABLE' | 'INVITEE_UNAVAILABLE', message }` with a detailed reason.

### 3.2 Creating an invite lobby

On a normal `POST /invite-match` (no `validateOnly`):

- Creates an `InviteLobby`:
  - `lobbyId` (uuid).
  - `player1Uuid`, `player2Uuid`.
  - `createdAt`.
  - Optional `player1Client` / `player2Client` when they later connect over WebSocket.
- Starts a timer (`INVITE_TIMEOUT_MS` ~ 15s):
  - If neither player connects to matchmaking within this window:
    - Lobby is destroyed; both sides (if connected) will eventually see a failure.
- Stores the lobby in:
  - `inviteMatches: Map<lobbyId, InviteLobby>`.
  - `playerToInviteLobby: Map<playerUuid, InviteLobby>`.

Return value to chat:

- `{ status: 'SUCCESS', lobbyId }`.

Chat doesn’t use `lobbyId` directly; it just informs users that the invite was accepted and leaves the rest to matchmaking.

---

## 4. Invite lobby → `/matchmaking` WebSocket

When the inviter or invitee later opens `/matchmaking` in their browser (or is already connected), matchmaking **attaches them to the invite lobby**.

### 4.1 Detecting lobby membership on connect

In `handleConnection` (`apps/matchmaking/index.ts`):

```ts
await restoreTournamentMembership(client, clients);

if (await isInLobby(client)) {
  await handleInviteLobbyJoin(client);
  return;
}
```

- `isInLobby(client)` checks whether `playerToInviteLobby` has an entry for `client.uuid`.
- If yes, the `handleInviteLobbyJoin` flow is used instead of the usual idle/queue path.

### 4.2 Joining the invite lobby

`handleInviteLobbyJoin(client)`:

- Finds the `InviteLobby` for `client.uuid`.
- Verifies:
  - Client is one of the two expected players.
  - Client is not in a tournament; if they are, the lobby is destroyed with reason `TOURNAMENT_INVITE_BLOCK_REASON`.
- Sets:
  - `lobby.player1Client` or `lobby.player2Client` to the `ClientInfo`.
  - `client.state = IN_INVITE_LOBBY`.

If **only one player** is connected so far:

- Clears any previous timer, then starts a lobby timeout (`LOBBY_TIMEOUT_MS` ~ 15s).
- Sends:

```jsonc
{ "type": "JOINED_INVITE_LOBBY", "playersJoined": 1, "totalPlayers": 2 }
```

If **both players** are now connected:

- Cancels lobby timeout.
- Sends:
  - To the second player:

    ```jsonc
    { "type": "JOINED_INVITE_LOBBY", "playersJoined": 2, "totalPlayers": 2 }
    ```

  - To the first player:

    ```jsonc
    { "type": "PLAYER_JOINED_INVITE_LOBBY", "playersJoined": 2, "totalPlayers": 2 }
    ```

- Calls `allocateAndHandoffInvite(lobby)`.

### 4.3 Destroying the lobby

`destroyInviteLobby(lobbyId, options?)`:

- Clears lobby timers.
- For each connected player:
  - If they were **not** in `IN_QUEUE`, resets their state to `IDLE`.
  - Sends:

```jsonc
{ "type": "INVITE_MATCH_FAILED", "reason": "<failureReason>" }
```

- Removes them from `playerToInviteLobby` and deletes the lobby.

`clearLobbiesWithClient(client)` is called when a `/matchmaking` connection closes:

- Starts a short grace period (2s) to avoid races when the player is reconnecting.
- After 2s, if the lobby still exists and both players haven’t joined, it is destroyed.

---

## 5. Allocator & handoff for invite matches

Invite matches ultimately rely on the **same allocator and handoff mechanism** as ranked queue, but with `mode: 'invite'` and no queue bucketting.

### 5.1 allocateAndHandoffInvite

`allocateAndHandoffInvite(lobby: InviteLobby)`:

- Ensures both `player1Client` and `player2Client` are present.
- Verifies neither is currently in a tournament.
- Calls:

```ts
await createMatch(lobby.player1Client, lobby.player2Client, 'invite');
```

- On success:
  - Removes lobby from `playerToInviteLobby` and `inviteMatches`.
  - From here, **normal handoff** takes over.

### 5.2 createMatch for mode `'invite'`

`createMatch` (`apps/matchmaking/utils/queue.ts`) is shared between modes:

- For non‑ranked modes (`mode !== 'ranked'`) it:
  - Calls `removeFromQueue(a.id)` and `removeFromQueue(b.id)` as a safety measure.
- Picks:
  - `matchId` (uuid).
  - `randomSeed` and `simulationStartTick`.
- Calls allocator:

```ts
allocatorRes = await axios.post(`${ALLOCATOR_URL}/allocate`, {
  idempotencyKey: matchId,
  mode, // 'invite' here
  players: [
    { playerIdentifier: a.uuid, side: 'west', alias: a.username, mmr: a.mmr },
    { playerIdentifier: b.uuid, side: 'east', alias: b.username, mmr: b.mmr },
  ],
  randomSeed,
  simulationStartTick,
  tournament: options?.tournament,
});
```

- On allocator failure:
  - Sends an `ERROR { code: 'ALLOCATOR' }` to both players.
  - Sets their state back to `IDLE`.
- On success:
  - Extracts `roomIdentifier`, `endpointUrl`, `perPlayerJoinTokens`.
  - For each player:
    - Sets `client.state = HANDOFF_TO_GAME`.
    - Sends a `HANDOFF` message:

```jsonc
{
  "type": "HANDOFF",
  "matchId": "<matchId>",
  "roomIdentifier": "<roomIdentifier>",
  "gameServerWSUrl": "<endpointUrl>",
  "side": "west" | "east",
  "joinToken": "<joinToken>",
  "joinTokenTTLSeconds": 60,
  "randomSeed": <randomSeed>,
  "simulationStartTick": <timestamp>,
  "tournament": null
}
```

- Then calls `handleHandoff(player, roomIdentifier, mode)` to track admission and timeouts.

From the client’s perspective:

- The `HANDOFF` looks identical to the one from a ranked match; only the source (`mode: 'invite'`) differs on the server side.

---

## 6. From handoff to `/g/:roomId` (client view)

On the frontend, **after chat invite acceptance**, the rest of the flow is the **same as a normal online match**.

### 6.1 Matchmaking client and online state

Once the invite match has been created and both players have joined `/matchmaking`:

- `HANDOFF` arrives on the matchmaking WebSocket.
- `useMatchmakingClient` dispatches a `handoff` action to the online state machine (`online/state/machine.ts`), just like for ranked matches:
  - Sets:
    - `serverUrl` = `gameServerWSUrl`.
    - `roomIdentifier`, `matchId`.
    - `seat` based on side.
    - `joinToken`, `randomSeed`.
  - Moves `status` to `'starting'`.

`OnlineGame` then:

- Uses `useBootstrapConfig` to build the config for `useGameBootstrap`.
- `useGameBootstrap` calls `connectOnline`, which:
  - Opens a WebSocket to `serverUrl` via `wsUrl(serverUrl)`.
  - Uses `Sec-WebSocket-Protocol: bearer,<joinToken>` for the initial connection.
  - Then follows the standard online flow described in `OnlinePongNetwork.md` and `OnlinePongDataPlane.md`.

### 6.2 Gateway and game node

As in ranked mode:

- Gateway:
  - Validates the join token (`validateJoin`).
  - Looks up `room-to-node:<roomIdentifier>` in Redis.
  - Proxies the WebSocket to the right game node.
- Game node:
  - Verifies join token again and attaches the player to the `MatchSession`.
  - Announces `ROOM_STATE`, `START`, and begins sending `FRAME` messages.
  - Manages disconnects, resumes, and final `MATCH_END`, using the same logic as any online match.

Reconnect/resume, latency handling, and result reporting work identically; see:

- `OnlinePongReconnect.md`
- `OnlinePongDataPlane.md`
- `ResultsAndRanking.md`

---

## 7. Differences vs normal ranked queue

Conceptually, invite matches are **just another mode** in the matchmaking service, but there are important behavioral differences.

### 7.1 Where the match starts

- **Ranked queue**:
  - Starts from `/pong/online` UI.
  - User calls `JOIN_QUEUE` over `/matchmaking`.
  - Matchmaking pairs players based on MMR buckets and queue position.

- **Invite match**:
  - Starts from `/chat` UI.
  - Users join the **chat channel** first, then use `inviteUser` / `acceptInvite`.
  - Chat calls `/invite-match` HTTP, which sets up an invite lobby in matchmaking.
  - Players then connect (or reconnect) to `/matchmaking`, which attaches them to the invite lobby and triggers `createMatch(..., 'invite')`.

### 7.2 Matchmaking state machines

- Ranked queue:
  - Client states: `IDLE` → `IN_QUEUE` → `PENDING_MATCH_ACCEPTANCE` → `HANDOFF_TO_GAME`.
  - Edge cases:
    - `MATCH_TIMEOUT`, `MATCH_DECLINED`, allocator errors.

- Invite match:
  - Client states: `IDLE` → `IN_INVITE_LOBBY` → `HANDOFF_TO_GAME`.
  - Edge cases:
    - `INVITE_MATCH_FAILED` (lobby timeout, tournament conflict, disconnect).
    - `INVITER_UNAVAILABLE` / `INVITEE_UNAVAILABLE` at validation/creation time.
    - Lobby destruction when one user disconnects before both players join.

### 7.3 Error and UX differences

- For ranked:
  - Errors surface as:
    - `ERROR` messages on `/matchmaking` (e.g. `ALLOCATOR`, `RATELIMIT`, `AUTH`).
    - Queue‑level messages (`MATCH_TIMEOUT`, `MATCH_DECLINED`).
  - UI shows:
    - "Pending match timed out", "Match declined", "No available game servers".

- For invites:
  - Errors surface in two places:
    - On `/chat` as `error`, `inviteExpired`, `inviteCancelled`.
    - On `/matchmaking` as `INVITE_MATCH_FAILED` and possibly `ERROR` (allocator).
  - Reasons include:
    - Inviter/invitee already in another invite, match, or tournament.
    - Invite lobby timed out before both players joined.
    - Tournament membership changed while lobby existed.
  - UI typically:
    - Shows toast/snackbar errors in Chat UI.
    - Resets players back to idle / lobby view if invite fails.

### 7.4 Ranking and game mode

- Because invite matches use mode `'invite'` when calling allocator:
  - Backend/game server can treat them differently for:
    - Whether they affect ELO/MMR.
    - How they are labeled in history ("friendly" vs "ranked").
- The handoff and game‑server pipeline, however, is the same:
  - Same join tokens, same gateway, same game node behavior.

---

## 8. Where to look when debugging invite flows

If invite games aren’t working as expected:

- **Chat layer**:
  - `apps/chat/handlers/handleInvite.ts` – inviteUser / acceptInvite / declineInvite logic.
  - `apps/chat/utils/invite.ts` – calls to `/invite-match` and invite expiry.

- **Matchmaking layer**:
  - `apps/matchmaking/utils/invites.ts` – invite lobbies, validation, and handoff.
  - `apps/matchmaking/utils/queue.ts` – `createMatch(..., 'invite')` and allocator integration.

- **Allocator / game‑server layer**:
  - `AllocatorAndScorer.md` for the room allocation flow.
  - `GameNode.md` for what happens once players reach the game node.

For a user‑journey view, combine this doc with:

- `ChatAndPresence.md` (chat UX and messages).
- `OnlinePongNetwork.md` (online match lifecycle after handoff).
