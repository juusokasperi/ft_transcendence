import type { MatchmakingMessage } from '@pong/shared/protocol/net';

export type Lobby = {
  lobbyId: string;
  hostName: string;
  capacity: number;
  membersCount: number;
};

// export type MatchmakingMessage =
// | { type: 'lobbyList'; lobbies: Lobby[] }
// | { type: 'lobbyAdded'; lobby: Lobby }
// | { type: 'lobbyUpdated'; lobby: Lobby }
// | { type: 'lobbyCreated'; lobbyId: string }
// | { type: 'lobbyRemoved'; lobbyId: string }
// | { type: 'invited'; lobbyId: string; from: string }
// | { type: 'inviteAccepted'; memberId: string }
// | { type: 'inviteDeclined'; memberId: string }
// | { type: 'memberReady'; memberId: string; ready: boolean }
// | { type: 'lobbyReady'; lobbyId: string };

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
    auth() {
      socket.send(JSON.stringify({ type: 'AUTH' }));
    },
    joinQueue() {
      socket.send(JSON.stringify({ type: 'JOIN_QUEUE' }));
    },
    leaveQueue() {
      socket.send(JSON.stringify({ type: 'LEAVE_QUEUE' }));
    },
    acceptMatch(matchId: string) {
      socket.send(JSON.stringify({ type: 'ACCEPT_MATCH', matchId }));
    },
    declineMatch(matchId: string) {
      socket.send(JSON.stringify({ type: 'DECLINE_MATCH', matchId }));
    },
    createLobby(username: string) {
      socket.send(JSON.stringify({ type: 'createLobby', username }));
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
