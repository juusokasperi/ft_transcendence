export type JoinQueueRequest = {
  type: 'JOIN_QUEUE';
  preferredSide?: 'west' | 'east';
};

export type MatchHandoff = {
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

export type ReadyMessage = {
  type: 'READY';
};

export type StartMessage = {
  type: 'START';
  startTick: number;
};

export type InputMessage = {
  type: 'INPUT';
  tick: number;
  axis: number;
};

export type SnapShotMessage = {
  type: 'SNAPSHOT';
  tick: number;
  state: any; // ??
};

export type EndMessage = {
  type: 'END';
  reason: 'completed' | 'forfeit' | 'disconnect';
  winner?: 'west' | 'east';
};

export type PingMessage = {
  type: 'PING';
  timestamp?: number;
};

export type PongMessage = {
  type: 'PONG';
  timestamp?: number;
};

export type MatchmakingClientMessage = JoinQueueRequest | ReadyMessage | PingMessage;

export type GameServerClientMessage =
  | StartMessage
  | InputMessage
  | SnapShotMessage
  | EndMessage
  | MatchHandoff
  | PongMessage;

export type ErrorMessage = {
  type: 'ERROR';
  code: string;
  message: string;
};

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
