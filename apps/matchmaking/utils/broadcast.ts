import type { ClientInfo } from '../types/types.ts';

/**
 * Broadcast a JSON-serializable payload to all connected matchmaking clients.
 *
 * Used for global notifications (e.g. tournaments, maintenance messages).
 * The payload is serialized once, then sent to every client socket.
 */
export function broadcastToAll(data: any, clients: Map<string, ClientInfo>) {
  const msg = JSON.stringify(data);
  clients.forEach((client) => {
    client.socket.send(msg);
  });
}
