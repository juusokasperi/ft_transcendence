import { WebSocketServer, type WebSocket, type RawData } from "ws";
import { v4 as uuid } from "uuid";

interface Client {
  id: string;
  socket: WebSocket;
  username?: string;
  channel?: string;
  blocked?: Set<string>;
}

const PORT = Number(process.env.CHAT_PORT || 6262);
const wss = new WebSocketServer({ port: PORT });
const clients = new Map<string, Client>();

console.log(`[CHAT] WebSocket server listening on ${PORT}`);

function broadcast(data: any, channel: string, excludeId?: string) {
  const msg = JSON.stringify(data);
  clients.forEach((c) => {
    if (c.channel === channel && c.id !== excludeId) {
      c.socket.send(msg);
    }
  });
}

function sendUserList(channel: string) {
  const users = Array.from(clients.values())
    .filter((c) => c.channel === channel && c.username)
    .map((c) => ({
      userId: c.id,
      username: c.username!,
    }));

  clients.forEach((c) => {
    if (c.channel === channel) {
      c.socket.send(JSON.stringify({ type: "userList", users }));
    }
  });
}

wss.on("connection", (socket: WebSocket) => {
  const id = uuid();
  const client: Client = { id, socket, blocked: new Set() };
  clients.set(id, client);

  console.log(`[CHAT] Client connected: ${id}`);
  socket.send(JSON.stringify({ type: "connected", clientId: id }));

  socket.on("message", (raw: RawData) => {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      console.log(`[CHAT] Invalid message from ${id}:`, raw.toString());
      return;
    }

    // Set username
    if (data.type === "setName") {
      client.username = data.username;
      console.log(`[CHAT] ${id} set username: ${data.username}`);
      return;
    }

    // Join a channel
    if (data.type === "joinChannel") {
      client.channel = data.channel;
      console.log(
        `[CHAT] ${client.username || id} joined channel: ${data.channel}`
      );

      // Notify others
      broadcast(
        {
          type: "userJoined",
          userId: id,
          username: client.username || "Unknown",
        },
        data.channel,
        id
      );

      // Confirm to client
      socket.send(
        JSON.stringify({ type: "channelJoined", channel: data.channel })
      );

      // Always send updated user list (to everyone in channel, including self)
      sendUserList(data.channel);
      return;
    }

    // Chat message
    if (data.type === "chat") {
      if (!client.channel) {
        console.log(`[CHAT] ${id} tried to send message without channel`);
        return;
      }

      console.log(
        `[CHAT][${client.channel}] ${client.username || id}: ${data.message}`
      );

      broadcast(
        {
          type: "chat",
          from: client.username || id,
          message: data.message,
        },
        client.channel
      );
      return;
    }

    // Block user
    if (data.type === "blockUser") {
      client.blocked?.add(data.username);
      socket.send(
        JSON.stringify({ type: "userBlocked", username: data.username })
      );
      return;
    }

    // Unblock user
    if (data.type === "unblockUser") {
      client.blocked?.delete(data.username);
      socket.send(
        JSON.stringify({ type: "userUnblocked", username: data.username })
      );
      return;
    }
  });

  socket.on("close", () => {
    console.log(`[CHAT] Client disconnected: ${id}`);
    if (client.username && client.channel) {
      broadcast(
        {
          type: "userLeft",
          userId: id,
          username: client.username,
        },
        client.channel
      );
      // Update user list after leaving
      sendUserList(client.channel);
    }
    clients.delete(id);
  });
});
