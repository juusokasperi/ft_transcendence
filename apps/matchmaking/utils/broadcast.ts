import type { ClientInfo } from '../types/types.ts';

export function broadcastToAll(data: any, clients: Map<string, ClientInfo>) {
  const msg = JSON.stringify(data);
  clients.forEach((client) => {
    client.socket.send(msg);
  });
}
