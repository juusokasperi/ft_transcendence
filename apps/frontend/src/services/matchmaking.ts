export type MatchmakingMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'lobbyCreated'; lobbyId: string }
  | { type: 'invited'; lobbyId: string; from: string }
  | { type: 'inviteAccepted'; memberId: string }
  | { type: 'inviteDeclined'; memberId: string }
  | { type: 'memberReady'; memberId: string; ready: boolean }
  | { type: 'lobbyReady'; lobbyId: string }
  | {
      type: 'matchFound';
      lobbyId: string;
      matchId: string;
      gameServerUrl: string;
      seat: 'P1' | 'P2';
    };

import { wsUrl } from '../utils/url';

export function createMatchmakingClient(onMessage: (msg: MatchmakingMessage) => void) {
  const socket = new WebSocket(wsUrl('/matchmaking'));
  socket.addEventListener('message', (ev) => {
    try {
      onMessage(JSON.parse(ev.data) as MatchmakingMessage);
    } catch {
      // what do we do with malformed messages?
    }
  });

  return {
    socket,
    createLobby() {
      socket.send(JSON.stringify({ type: 'createLobby' }));
    },
    invite(targetId: string, lobbyId: string) {
      socket.send(JSON.stringify({ type: 'invite', targetId, lobbyId }));
    },
    acceptInvite(lobbyId: string) {
      socket.send(JSON.stringify({ type: 'acceptInvite', lobbyId }));
    },
    declineInvite(lobbyId: string) {
      socket.send(JSON.stringify({ type: 'declineInvite', lobbyId }));
    },
    setReady(lobbyId: string, ready: boolean) {
      socket.send(JSON.stringify({ type: 'ready', lobbyId, ready }));
    },
  } as const;
}
