import type { MatchmakingMessage, TournamentSize } from '@pong/shared/protocol/net';

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

type MatchmakingClientLifecycleHandlers = {
  onOpen?(event: Event): void;
  onError?(event: Event): void;
  onClose?(event: CloseEvent): void;
};

const READY_STATE_OPEN = WebSocket.OPEN;
const READY_STATE_CONNECTING = WebSocket.CONNECTING;

function serialize(payload: unknown) {
  return JSON.stringify(payload);
}

export function createMatchmakingClient(
  onMessage: (msg: MatchmakingMessage) => void,
  lifecycleHandlers: MatchmakingClientLifecycleHandlers = {},
) {
  const socket = new WebSocket(wsUrl('/matchmaking'));
  const pendingMessages: string[] = [];

  socket.addEventListener('message', (ev) => {
    try {
      onMessage(JSON.parse(ev.data) as MatchmakingMessage);
    } catch {
      // what do we do with malformed messages?
    }
  });

  socket.addEventListener('open', (event) => {
    while (pendingMessages.length > 0 && socket.readyState === READY_STATE_OPEN) {
      const next = pendingMessages.shift();
      if (next !== undefined) {
        try {
          socket.send(next);
        } catch {
          pendingMessages.unshift(next);
          break;
        }
      }
    }
    lifecycleHandlers.onOpen?.(event);
  });

  socket.addEventListener('error', (event) => {
    lifecycleHandlers.onError?.(event);
  });

  socket.addEventListener('close', (event) => {
    pendingMessages.length = 0;
    lifecycleHandlers.onClose?.(event);
  });

  const safeSend = (payload: unknown) => {
    const serialized = serialize(payload);
    const state = socket.readyState;
    if (state === READY_STATE_OPEN) {
      try {
        socket.send(serialized);
      } catch (error) {
        console.warn('[matchmaking] failed to send payload', error);
      }
      return;
    }

    if (state === READY_STATE_CONNECTING) {
      pendingMessages.push(serialized);
      return;
    }

    console.warn('[matchmaking] dropping message because socket is not open', {
      readyState: state,
      payload,
    });
  };

  return {
    socket,
    auth() {
      safeSend({ type: 'AUTH' });
    },
    joinQueue() {
      safeSend({ type: 'JOIN_QUEUE' });
    },
    leaveQueue() {
      safeSend({ type: 'LEAVE_QUEUE' });
    },
    acceptMatch(matchId: string) {
      safeSend({ type: 'ACCEPT_MATCH', matchId });
    },
    declineMatch(matchId: string) {
      safeSend({ type: 'DECLINE_MATCH', matchId });
    },
    createLobby(username: string) {
      safeSend({ type: 'createLobby', username });
    },
    invite(targetId: string, lobbyId: string) {
      safeSend({ type: 'invite', targetId, lobbyId });
    },
    acceptInvite(lobbyId: string) {
      safeSend({ type: 'acceptInvite', lobbyId });
    },
    declineInvite(lobbyId: string) {
      safeSend({ type: 'declineInvite', lobbyId });
    },
    setReady(lobbyId: string, ready: boolean) {
      safeSend({ type: 'ready', lobbyId, ready });
    },
    createTournament(size: TournamentSize = 4, name?: string) {
      const payload: { type: 'CREATE_TOURNAMENT'; size: TournamentSize; name?: string } = {
        type: 'CREATE_TOURNAMENT',
        size,
      };
      if (name && name.trim().length) payload.name = name.trim();
      safeSend(payload);
    },
    joinTournament(tournamentId: string | number, alias?: string) {
      const payload: { type: 'JOIN_TOURNAMENT'; tournamentId: string; alias?: string } = {
        type: 'JOIN_TOURNAMENT',
        tournamentId: String(tournamentId),
      };
      if (alias && alias.trim().length) payload.alias = alias.trim();
      safeSend(payload);
    },
    leaveTournament(tournamentId: string | number) {
      const payload = { type: 'LEAVE_TOURNAMENT', tournamentId: String(tournamentId) } as const;
      safeSend(payload);
    },
    forfeitTournament(tournamentId: string | number) {
      const payload = { type: 'FORFEIT_TOURNAMENT', tournamentId: String(tournamentId) } as const;
      safeSend(payload);
    },
    acceptScheduled(tournamentMatchId: number) {
      safeSend({ type: 'ACCEPT_SCHEDULED', tournamentMatchId });
    },
    close() {
      socket.close();
    },
  } as const;
}
