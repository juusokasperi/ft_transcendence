// services/chat.ts
import { wsUrl } from '../utils/url';

export type ChatMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'userJoined'; userId: string; username: string }
  | { type: 'userLeft'; userId: string; username: string }
  | { type: 'chat'; from: string; message: string };

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[OnlineGame]', ...args);
  }
};

export function createChatClient(onMessage: (msg: ChatMessage) => void) {
  const socket = new WebSocket(wsUrl('/chat'));

  socket.addEventListener('message', (ev) => {
    try {
      onMessage(JSON.parse(ev.data) as ChatMessage);
    } catch {
      debugLog('Malformed chat message', ev.data);
    }
  });

  return {
    socket,
    setName(username: string) {
      socket.send(JSON.stringify({ type: 'setName', username }));
    },
    sendMessage(message: string) {
      socket.send(JSON.stringify({ type: 'chat', message }));
    },
  } as const;
}
