export type HandoffMessage = {
  type: 'HANDOFF';
  matchId: string;
  roomId: string;
  gameServerWSUrl: string;
  side: 'west' | 'east';
  joinToken: string;
  joinTokenTTLSeconds: number;
  randomSeed: number;
  simulationStartTick: number;
};

export type ConnectedMessage = {
  type: 'CONNECTED';
  clientId: string;
};

export type MatchFoundMessage = {
  type: 'MATCH_FOUND';
  matchId: string;
  opponent: {
    username: string;
    mmr: number;
  };
};

export type MatchDeclinedMessage = {
  type: 'MATCH_DECLINED';
  matchId: string;
};

export type QueueJoinedMessage = {
  type: 'QUEUE_JOINED';
};

export type QueueLeftMessage = {
  type: 'QUEUE_LEFT';
};

export type MatchmakingMessage =
  | ConnectedMessage
  | QueueJoinedMessage
  | QueueLeftMessage
  | MatchFoundMessage
  | MatchDeclinedMessage
  | HandoffMessage
  | ErrorMessage;

export type JoinTokenClaims = {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  roomIdentifier: string;
  sub: string;
  side: 'west' | 'east';
  simulationStartTick: number;
  region?: string;
};

export type ErrorMessage = {
  type: 'ERROR';
  code: string;
  message: string;
};

export type JoinQueueRequest = {
  type: 'JOIN_QUEUE';
  preferredSide?: 'west' | 'east';
};

export type LeaveQueueRequest = {
  type: 'LEAVE_QUEUE';
};

export type AcceptMatchRequest = {
  type: 'ACCEPT_MATCH';
  matchId: string;
};

export type DeclineMatchRequest = {
  type: 'DECLINE_MATCH';
  matchId: string;
};

export type MatchmakingClientMessage =
  | JoinQueueRequest
  | LeaveQueueRequest
  | AcceptMatchRequest
  | DeclineMatchRequest;

// Types that were in blueprint but not implemented:

// export type MatchmakingClientMessage = JoinQueueRequest | ReadyMessage | PingMessage;

// export type ReadyMessage = {
//   type: 'READY';
// };

// export type StartMessage = {
//   type: 'START';
//   startTick: number;
// };

// export type InputMessage = {
//   type: 'INPUT';
//   tick: number;
//   axis: number;
// };

// export type SnapShotMessage = {
//   type: 'SNAPSHOT';
//   tick: number;
//   state: any; // ??
// };

// export type EndMessage = {
//   type: 'END';
//   reason: 'completed' | 'forfeit' | 'disconnect';
//   winner?: 'west' | 'east';
// };

// export type PingMessage = {
//   type: 'PING';
//   timestamp?: number;
// };

// export type PongMessage = {
//   type: 'PONG';
//   timestamp?: number;
// };

// export type GameServerClientMessage =
//   | StartMessage
//   | InputMessage
//   | SnapShotMessage
//   | EndMessage
//   | MatchHandoff
//   | PongMessage;
