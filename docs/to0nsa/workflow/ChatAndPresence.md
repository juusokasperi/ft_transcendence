# Chat & Presence Workflow – `/chat` WebSocket and Invites

This document explains the **chat and presence flow** used in ft_transcendence, focusing on:

- The **chat service** (`apps/chat`) – WebSocket server for `/chat`.
- The **frontend RealtimeSocketContext** – how the browser connects and subscribes.
- Presence updates and **user lists**.
- The **blocked users** system and how it integrates with chat.
- **Game invites** started from chat and handed off to matchmaking.

It complements:

- `BackendAndAPIs.md` – how users and blocked users are stored and exposed.
- `MatchmakingService.md` – how invite‑based matchmaking (`/invite-match`) works.
- `OnlinePongNetwork.md` – how invites ultimately hand off into online matches.
  - `InviteMatchFlow.md` – detailed invite‑based 1v1 flow from chat → matchmaking → game.

For implementation details of the chat server:

- `docs/to0nsa/node/RealtimeServers.md` – Fastify/WebSocket setup for the chat service.

---

## 1. High‑level view

Components:

- **Backend API** (`apps/backend`):
  - Owns user accounts and **blocked users** (`/api/blocked-users`).
  - Issues the site auth token (`SECRET`) used by chat for authentication.

- **Chat service** (`apps/chat`):
  - Fastify + `@fastify/websocket`.
  - Exposes `GET /chat` (WebSocket).
  - Authenticates users using the same JWT secret as the site.
  - Maintains:
    - A map of connected clients.
    - Block lists per client.
    - A map of pending invites for game matches.

- **Frontend** (`RealtimeSocketContext + Chat` UI):
  - Opens a WebSocket to `/chat`.
  - Sends messages (`chat`, `privateMessage`, `joinChannel`, `inviteUser`, …).
  - Renders chat UI, user list, invite dialogs, and presence indicators.

- **Matchmaking** (`apps/matchmaking`):
  - Receives **invite‑based matchmaking requests** from chat service (`/invite-match`).

---

## 2. Frontend: RealtimeSocketContext and Chat

### 2.1 WebSocket connection

`apps/frontend/src/context/RealtimeSocketContext.tsx`:

```ts
const WS_URL = wsUrl('/chat');

export function RealtimeSocketProvider({ children }) {
  const { user } = useAppContext();
  const userUuid = user?.uuid ?? null;
  const username = user?.username ?? 'Player';

  const wsRef = useRef<WebSocket | null>(null);
  const [readyState, setReadyState] = useState(WebSocket.CONNECTING);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!userUuid) {
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
      setReadyState(WebSocket.CLOSED);
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setReadyState(ws.readyState);
    };

    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (data.type === 'blockedList') {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: 'setName', username }));
      }

      // Notify all registered handlers
      messageHandlersRef.current.forEach((handler) => handler(data));
    };

    ws.onclose = () => {
      setIsConnected(false);
      setReadyState(WebSocket.CLOSED);
      wsRef.current = null;
    };

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [userUuid, username]);
```

Key points:

- If no logged‑in user (`userUuid` is null), chat WS is closed and not opened.
- Upon connection, the client waits for a `blockedList` message before:
  - Marking `isConnected = true`.
  - Sending `setName` to the server.

Afterward, components can:

- Use `send(payload)` to send messages.
- Use `subscribe(handler)` to receive messages.

### 2.2 Chat UI and presence indicator

`apps/frontend/src/components/Chat.tsx`:

- Uses `useRealtimeSocket()` to send/receive messages.
- Sends messages like:
  - `joinChannel` – join e.g. the “Lobby” channel.
  - `chat` – broadcast to channel.
  - `privateMessage` – direct messages.
  - `inviteUser`, `acceptInvite`, `declineInvite` – game invites.
  - `blockUser` / `unblockUser`.
- Handles messages from server:
  - `connected`, `userList`, `userJoined`, `userLeft`.
  - `chat`, `privateMessage`.
  - `inviteGame`, `inviteSent`, `inviteAccepted`, `inviteDeclined`, `inviteExpired`.
  - `error`, `INFO`.

`ChatToggleButton` listens for a custom DOM event:

```ts
useEffect(() => {
  const handler = (ev: Event) => {
    const customEvent = ev as CustomEvent<{ active?: boolean }>;
    setIndicatorActive(Boolean(customEvent.detail?.active));
  };
  window.addEventListener('chat:indicator', handler as EventListener);
  return () => window.removeEventListener('chat:indicator', handler as EventListener);
}, []);
```

- This lets chat trigger a “new message” indicator even when the panel is closed.

---

## 3. Chat service: connection and authentication

### 3.1 WebSocket endpoint

`apps/chat/index.ts`:

```ts
const fastify = Fastify({ logger: createFastifyLoggerConfig({ service: 'chat' }) });
registerMetrics(fastify, { labels: { service: 'chat' } });

const clients = new Map<string, Client>();
const pendingInvites = new Map<string, PendingInvite>();

setInterval(() => cleanupExpiredInvites(pendingInvites, clients, fastify.log), 10000);

await fastify.register(websocket);

fastify.get('/health', async () => ({ status: 'ok' }));
fastify.get('/chat', { websocket: true }, (connection, request) =>
  handleConnection(connection, request, clients, pendingInvites, fastify),
);
```

This is the server counterpart to `wsUrl('/chat')` on the frontend.

### 3.2 Auth: reusing the site JWT

`apps/chat/utils/auth.ts`:

```ts
import jwt from 'jsonwebtoken';
import { SECRET } from './config';

async function verifySiteToken(token: string): Promise<{ username: string; uuid: string }> {
  const payload = jwt.verify(token, SECRET) as { username: string; uuid: string };
  return { uuid: payload.uuid, username: payload.username };
}

export function extractToken(socket: ChatSocket, req: IncomingMessage): string | undefined {
  const cookieHeader = req.headers.cookie;
  const match = cookieHeader?.match(new RegExp('(^|;)\\s*token=([^;]*)'));
  if (!match || !match[2]) {
    socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Token missing' }));
    socket.close();
    return undefined;
  }
  return match[2];
}
```

The chat service:

- Reads a **token cookie** from the WebSocket upgrade request (not the same cookie name as backend, but same JWT contents).
- Verifies it with `SECRET` (must match the backend auth secret).
- Extracts `username` and `uuid`.

`handleAuth` also:

- Ensures only one active connection per user:
  - If the same `uuid` is already connected, it closes the old connection and admits the new one.

This ensures:

- Chat knows the same identity as the backend.
- Users can’t impersonate others; they must have a valid site JWT cookie.

---

## 4. Presence and channels

### 4.1 Connection lifecycle

`handleConnection` in `apps/chat/handlers/handleConnection.ts`:

```ts
export async function handleConnection(socket, request, clients, pendingInvites, fastify) {
  const token = extractToken(socket, request.raw);
  if (!token) return;

  const id = uuid();
  const client: Client = { id, uuid: '', socket, blocked: new Set() };
  const authenticated = await handleAuth(client, token, clients);
  if (!authenticated) return;
  clients.set(id, client);

  fastify.log.info({ clientId: id }, '[CHAT] Client connected');
  socket.send(JSON.stringify({ type: 'connected', clientId: id }));

  // blocked list from backend for this user
  await getBlocked(client, token, fastify.log);
  // ...
}
```

After authentication:

- The client is added to the `clients` map.
- A `connected` message with `clientId` is sent.
- `getBlocked` populates `client.blocked` by calling backend `/api/blocked-users` (see next section).

### 4.2 Joining channels and user lists

`handleJoinChannel` (in `apps/chat/handlers/handleJoinChannel.ts`):

- Sets `client.channel` (e.g. `'Lobby'`).
- Broadcasts `userJoined` / `userLeft`.
- Calls `sendUserList` to send a `userList` message to everyone in the channel.

`sendUserList` in `apps/chat/utils/broadcast.ts`:

```ts
export function sendUserList(channel: string, clients: Map<string, Client>) {
  const users = Array.from(clients.values())
    .filter((client) => client.channel === channel && client.username)
    .map((client) => ({
      userId: client.id,
      userUuid: client.uuid,
      username: client.username!,
    }));

  clients.forEach((client) => {
    if (client.channel === channel) {
      client.socket.send(JSON.stringify({ type: 'userList', users }));
    }
  });
}
```

So every time a user joins/leaves:

- Everyone in the channel gets an updated `userList`.
- Frontend uses this to show who is currently online in that chat channel.

On socket close:

- `handleConnection`’s `socket.on('close')`:
  - Removes the client from `clients`.
  - Cleans up any pending invites involving this user.
  - Broadcasts `userLeft` and a new `userList` if the user had a channel.

---

## 5. Blocked users integration

There are **two layers** of blocking:

1. **Persistent block list in backend**:
   - Stored in DB.
   - Managed via `/api/blocked-users`.
2. **Runtime block set in chat service**:
   - Stored in `client.blocked`.
   - Used to filter chat messages.

### 5.1 Backend routes: `/api/blocked-users`

`apps/backend/routes/blockedUsers.ts`:

- `GET /api/blocked-users`:
  - Uses `authPreHandler` + `tokenUuidCheck`.
  - Returns a list of UUIDs the current user has blocked.

- `POST /api/blocked-users`:
  - Blocks a user by identifier (username/uuid/email).
  - Inserts a row into `BlockedUsers` table.

- `DELETE /api/blocked-users`:
  - Unblocks a user by username.

The frontend chat UI uses these to manage blocking from the HTTP side.

### 5.2 Chat service: blocked list at connect time

`getBlocked` in `apps/chat/handlers/handleBlock.ts`:

- Uses the site token to call backend `/api/blocked-users`.
- Fills `client.blocked` with UUIDs of users that this client has blocked.

Blocking/unblocking within chat:

- `handleBlockUser` / `handleUnblockUser`:
  - Update both:
    - Chat server’s `client.blocked` set.
    - Backend DB via HTTP calls (to persist blocks).

### 5.3 Filtering messages

`broadcast` in `apps/chat/utils/broadcast.ts`:

```ts
if (data.type === 'chat' && sender) {
  const senderUuid = sender.uuid;
  const targetUuid = client.uuid;

  if (senderUuid && targetUuid) {
    if (sender.blocked.has(targetUuid) || client.blocked.has(senderUuid)) return;
  }
}
client.socket.send(msg);
```

So for broadcast chat messages:

- Messages are **not delivered** if:
  - The sender has blocked the target, or
  - The target has blocked the sender.

This ensures blocking is respected even for channel‑wide messages.

Private messages (`handlePrivateMessage`) use similar logic to skip delivering DMs when blocking applies.

---

## 6. Game invites via chat

Chat also provides a way to **invite an opponent into a 1v1 match**.

### 6.1 Creating and managing invites

`PendingInvite` in `apps/chat/types.ts`:

```ts
export interface PendingInvite {
  fromUserUuid: string;
  fromUsername: string;
  toUserUuid: string;
  toUsername: string;
  createdAt: number;
}
```

`handleInviteUser` (in `apps/chat/handlers/handleInvite.ts`):

- Validates:
  - Target user exists in channel.
  - Not inviting self.
  - User is not blocked.
  - Matchmaking says both are available (`checkInviteAvailability`).
- Creates a `PendingInvite` and stores it in `pendingInvites`.
- Notifies:
  - Target with `inviteGame` (contains `inviteId`, inviter username, UUID).
  - Inviter with `inviteSent`.

`cleanupExpiredInvites` (`apps/chat/utils/invite.ts`):

- Runs every 10 seconds.
- For any invite older than `INVITE_TIMEOUT_MS` (60 seconds):
  - Notifies both users with `inviteExpired`.
  - Deletes the invite.

### 6.2 Accepting/declining invites

`handleAcceptInvite`:

- Validates:
  - Invite exists and belongs to this client.
  - Inviter is still connected.
- Calls `createInviteMatch` to talk to matchmaking service:

```ts
const result = await createInviteMatch(invite.fromUserUuid, invite.toUserUuid, log);
```

`createInviteMatch`:

- POSTs to `${MM_SERVICE_URL}/invite-match`:
  - This is an HTTP endpoint in `apps/matchmaking` that:
    - Validates both players are available.
    - Creates a match and sends `HANDOFF` messages, just like normal matchmaking, but based on specific players rather than queue.

If successful:

- Both clients receive `inviteAccepted`.
- Other pending invites from the same inviter are cancelled.

If failed:

- The invitee gets an `error` message (reason depends on `status`).
- Invite is removed.

`handleDeclineInvite`:

- Notifies both users with `inviteDeclined`.
- Removes invite from `pendingInvites`.

---

## 7. Presence, identity, and integration summary

Putting it together:

1. **Identity**:
   - Backend issues a site JWT on login.
   - Chat server reuses this JWT (`SECRET`) to authenticate WebSocket connections and identify users.

2. **Presence**:
   - Chat service maintains a `clients` map of connected users.
   - Channels + `userList` broadcasts let the frontend show who’s online in each channel.
   - `userJoined` / `userLeft` events update presence in real time.

3. **Blocked users**:
   - Backend stores persistent blocks (`/api/blocked-users`).
   - Chat fetches these on connect and keeps a `blocked` set on each client.
   - Broadcasts and private messages are filtered using these sets.

4. **Game invites**:
   - Chat is the UX layer for 1v1 invites.
   - Internally, invites are coordinated via `pendingInvites` and the **matchmaking** invite API.
   - When an invite is accepted, matchmaking and allocator create a room, and the normal online Pong handoff flow takes over.

From a developer’s perspective:

- Chat service is **stateless across restarts** except for in‑memory client and invite maps; persistent concepts (users, blocks, matches, tournaments) live in backend and matchmaking.
- Any feature that needs to consider **who is online / available** for games should ask either:
  - Chat for presence (who is in which channel), and
  - Matchmaking for availability (not already in a match/tournament).

With this, you now have a complete view of the `/chat` WebSocket protocol, presence updates, blocked‑user behavior, and how chat acts as a bridge into matchmaking for invite‑based games.
