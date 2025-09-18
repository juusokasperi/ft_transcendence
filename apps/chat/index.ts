// server/chat.ts
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { v4 as uuid } from 'uuid';

interface Client {
  id: string;
  socket: WebSocket;
  username?: string;
}

const PORT = Number(process.env.CHAT_PORT || 6262);
const wss = new WebSocketServer({ port: PORT });
const clients = new Map<string, Client>();

console.log(`[CHAT] WebSocket server listening on ${PORT}`);

function broadcast(data: any, excludeId?: string) {
  const msg = JSON.stringify(data);
  clients.forEach((c) => {
    if (c.id !== excludeId) {
      c.socket.send(msg);
    }
  });
}

wss.on('connection', (socket: WebSocket) => {
  const id = uuid();
  const client: Client = { id, socket };
  clients.set(id, client);

  console.log(`[CHAT] Client connected: ${id}`);
  socket.send(JSON.stringify({ type: 'connected', clientId: id }));

  socket.on('message', (raw: RawData) => {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      console.log(`[CHAT] Invalid message from ${id}:`, raw.toString());
      return;
    }

    if (data.type === 'setName') {
      client.username = data.username;
      console.log(`[CHAT] ${id} set username: ${data.username}`);
      broadcast({ type: 'userJoined', userId: id, username: data.username }, id);
    } else if (data.type === 'chat') {
      console.log(`[CHAT] ${client.username || id}: ${data.message}`);
      broadcast({ type: 'chat', from: client.username || id, message: data.message });
    }
  });

  socket.on('close', () => {
    console.log(`[CHAT] Client disconnected: ${id}`);
    if (client.username) {
      broadcast({ type: 'userLeft', userId: id, username: client.username });
    }
    clients.delete(id);
  });
});
