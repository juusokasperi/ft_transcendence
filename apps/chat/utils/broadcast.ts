import type { Client } from '../types';

export function broadcast(
  data: any,
  channel: string,
  clients: Map<string, Client>,
  excludeId?: string,
  sender?: Client,
) {
  const msg = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.channel === channel && client.id !== excludeId) {
      if (data.type === 'chat' && sender) {
        const senderUuid = sender.uuid;
        const targetUuid = client.uuid;

        if (senderUuid && targetUuid) {
          if (sender.blocked.has(targetUuid) || client.blocked.has(senderUuid)) return;
        }
      }
      client.socket.send(msg);
    }
  });
}

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
