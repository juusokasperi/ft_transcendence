export type TournamentParticipantMapping = {
  participantId: number;
  userUuid: string;
  alias?: string;
};

export type TournamentContext = {
  tournamentId: number;
  tournamentMatchId: number;
  tournamentStage: 'semifinal' | 'final' | 'bronze';
  participants?: TournamentParticipantMapping[];
};

export type HandoffMessage = {
  type: 'HANDOFF';
  matchId: string;
  roomIdentifier: string;
  gameServerWSUrl: string;
  side: 'west' | 'east';
  joinToken: string;
  joinTokenTTLSeconds: number;
  randomSeed: number;
  simulationStartTick: number;
  tournament?: TournamentContext;
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

export type MatchTimeoutMessage = {
  type: 'MATCH_TIMEOUT';
};

export type HandoffTimeoutMessage = {
  type: 'HANDOFF_TIMEOUT';
  roomIdentifier: string;
  message: string;
};

export type TournamentParticipantState = {
  participantId: number;
  alias: string;
  userUuid: string | null;
  seed: number | null;
  status: string;
};

export type TournamentMatchPlayerState = {
  participantId: number;
  teamNumber: number;
  alias: string;
  status: string;
  score: number | null;
};

export type TournamentMatchState = {
  tournamentMatchId: number;
  roundNumber: number;
  roundPosition: number;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  matchId: number | null;
  players: TournamentMatchPlayerState[];
};

export type TournamentLobbyUpdatedMessage = {
  type: 'TOURNAMENT_LOBBY_UPDATED';
  tournamentId: number;
  status: string;
  maxParticipants: number | null;
  participants: TournamentParticipantState[];
};

export type TournamentBracketSnapshotMessage = {
  type: 'TOURNAMENT_BRACKET_SNAPSHOT';
  tournamentId: number;
  matches: TournamentMatchState[];
};

export type TournamentMatchesReadyMessage = {
  type: 'TOURNAMENT_MATCHES_READY';
  tournamentId: number;
  matches: Array<{
    tournamentMatchId: number;
    stage: 'semifinal' | 'final' | 'bronze';
    participants: Array<{
      userUuid: string;
      alias: string;
      participantId: number;
      teamNumber: number;
    }>;
  }>;
};

export type TournamentMatchCountdownStatus = 'running' | 'cancelled' | 'started';

export type TournamentMatchCountdownMessage = {
  type: 'TOURNAMENT_MATCH_COUNTDOWN';
  tournamentId: number;
  tournamentMatchId: number;
  stage: 'semifinal' | 'final' | 'bronze';
  secondsRemaining: number;
  targetStartEpochMs: number;
  status: TournamentMatchCountdownStatus;
};

export type MatchmakingMessage =
  | ConnectedMessage
  | QueueJoinedMessage
  | QueueLeftMessage
  | MatchFoundMessage
  | MatchDeclinedMessage
  | HandoffMessage
  | MatchTimeoutMessage
  | HandoffTimeoutMessage
  | TournamentLobbyUpdatedMessage
  | TournamentBracketSnapshotMessage
  | TournamentMatchesReadyMessage
  | TournamentMatchCountdownMessage
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
} & Partial<TournamentContext>;

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

export type TournamentSize = 4 | 8 | 16;

export type CreateTournamentRequest = {
  type: 'CREATE_TOURNAMENT';
  size: TournamentSize;
  name?: string;
};

export type JoinTournamentRequest = {
  type: 'JOIN_TOURNAMENT';
  tournamentId: string;
  alias?: string;
};

export type LeaveTournamentRequest = {
  type: 'LEAVE_TOURNAMENT';
  tournamentId: string;
};

export type ForfeitTournamentRequest = {
  type: 'FORFEIT_TOURNAMENT';
  tournamentId: string;
};

export type AcceptScheduledRequest = {
  type: 'ACCEPT_SCHEDULED';
  tournamentMatchId: number;
};

export type MatchmakingClientMessage =
  | JoinQueueRequest
  | LeaveQueueRequest
  | AcceptMatchRequest
  | DeclineMatchRequest
  | CreateTournamentRequest
  | JoinTournamentRequest
  | LeaveTournamentRequest
  | ForfeitTournamentRequest
  | AcceptScheduledRequest;

export type RoomState = 'WAITING_FOR_OPPONENT' | 'READY' | 'PLAYING';

export type RoomStateMessage = {
  type: 'ROOM_STATE';
  roomIdentifier: string;
  state: RoomState;
  seat?: 'P1' | 'P2';
  startAtEpochMs?: number;
  randomSeed?: number;
  tickRateHz?: number;
};

export type StartMessage = {
  type: 'START';
  roomIdentifier: string;
  startAtEpochMs: number;
  randomSeed: number;
  tickRateHz: number;
};

export type OpponentDisconnectedMessage = {
  type: 'OPPONENT_DISCONNECTED';
  gracePeriodMs: number;
};

export type OpponentReconnectedMessage = {
  type: 'OPPONENT_RECONNECTED';
};

export type MatchEndMessage = {
  type: 'MATCH_END';
  reason: 'opponent_timeout' | 'completed' | 'error';
  winner?: 'east' | 'west';
};

export type GameServerControlMessage = 
  | RoomStateMessage 
  | StartMessage 
  | OpponentDisconnectedMessage 
  | OpponentReconnectedMessage
  | MatchEndMessage;

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
