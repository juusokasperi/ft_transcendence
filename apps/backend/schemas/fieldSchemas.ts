export const PaddleColorSchema = {
  type: 'string',
  pattern: '^#[0-9A-Fa-f]{6}$',
  description: 'Paddle color in hex format (e.g., #FFFFFF)',
  minLength: 7,
  maxLength: 7,
};

export const ColorBlindSchema = {
  type: 'integer',
  minimum: 0,
  maximum: 4,
};

export const PhotoSensitiveSchema = {
  type: 'integer',
  minimum: 0,
  maximum: 2,
};

export const PassSchema = {
  type: 'string',
  minLength: 12,
  maxLength: 42,
  allOf: [
    { pattern: '^[a-zA-Z0-9!@#$%^&*()\-_=+[\\]{};:|,<.>/?]+$' },
    { pattern: '[a-z]' },
    { pattern: '[A-Z]' },
    { pattern: '[0-9]' },
    { pattern: '[!@#$%^&*()\-_=+[\\]{};:|,<.>/?]+$' },
  ],
  description:
    'Password: Must contain uppercase, lowercase, digit and special character (!@#$%^&()-_=+[]{};:|,<.>/?',
};

export const UsernameSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 16,
  pattern: '^(?!-)(?!.*--)[a-zA-Z0-9-]+$',
  description:
    'Username: letters, numbers, dashes allowed. Cannot start with a dash or have consecutive dashes.',
};

export const EmailSchema = {
  type: 'string',
  format: 'email',
  description: 'User email address',
};

export const UuidSchema = {
  type: 'string',
  format: 'uuid',
  description: 'User unique id',
};

export const AvatarSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
  description: 'User avatar filename',
};

const BaseStatsProperties = {
  pointsScored: { type: 'number', minimum: 0 },
  pointsConceded: { type: 'number', minimum: 0 },
  gamesWon: { type: 'number', minimum: 0 },
  gamesLost: { type: 'number', minimum: 0 },
  maxPointLead: { type: 'number', minimum: 0 },
};

export const StatsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { ...BaseStatsProperties },
  required: Object.keys(BaseStatsProperties),
};

export const UserStatsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...BaseStatsProperties,
    matchesWon: { type: 'number', minimum: 0 },
    matchesLost: { type: 'number', minimum: 0 },
    ranking: { type: 'number', minimum: 0 },
    createdAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: [
    ...Object.keys(BaseStatsProperties),
    'matchesWon',
    'matchesLost',
    'ranking',
    'createdAt',
  ],
};

export const TeamSchema = {
  type: 'array',
  nullable: true,
  items: {
    type: 'object',
    properties: {
      uuid: UuidSchema,
      username: UsernameSchema,
      avatar: AvatarSchema,
      ranking: { type: 'number', minimum: 0 },
      createdAt: { type: 'string', format: 'date-time' },
      rankingDelta: { type: 'number' },
      stats: StatsSchema,
    },
    required: ['uuid', 'username', 'ranking', 'createdAt', 'rankingDelta'],
  },
};

export const TournamentIDSchema = {
  anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }],
  description: 'Optional tournament ID',
};

export const TournamentStageSchema = {
  anyOf: [
    {
      type: 'string',
      enum: ['quarterfinal', 'semifinal', 'final', 'bronze'],
    },
    { type: 'null' },
  ],
  description: 'Tournament stage',
};

export const MatchSchema = {
  type: 'object',
  properties: {
    id: { type: 'number', minimum: 0 },
    team1Score: { type: 'number', minimum: 0 },
    team2Score: { type: 'number', minimum: 0 },
    players: {
      type: 'object',
      properties: {
        team1: TeamSchema,
        team2: TeamSchema,
      },
      required: ['team1', 'team2'],
    },
    playedAt: { type: 'string', format: 'date-time' },
    tournamentId: TournamentIDSchema,
    tournamentStage: TournamentStageSchema,
  },
  required: ['id', 'team1Score', 'team2Score', 'players', 'playedAt'],
};

// Per-player stats payload item for posting match stats
export const MatchPlayerStatsItemSchema = {
  type: 'object',
  properties: {
    uuid: UuidSchema,
    pointsScored: { type: 'integer', minimum: 0 },
    pointsConceded: { type: 'integer', minimum: 0 },
    gamesWon: { type: 'integer', minimum: 0 },
    gamesLost: { type: 'integer', minimum: 0 },
    maxPointLead: { type: 'integer', minimum: 0 },
  },
  required: ['uuid', 'pointsScored', 'pointsConceded', 'gamesWon', 'gamesLost', 'maxPointLead'],
  additionalProperties: false,
};

export const MatchPlayerStatsArraySchema = {
  type: 'array',
  minItems: 1,
  items: MatchPlayerStatsItemSchema,
};

export const TournamentStatusSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 32,
  description: 'Lifecycle status for a tournament (draft, scheduled, active, completed, etc.)',
};

export const TournamentFormatSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 48,
  description: 'Identifier for the tournament format, such as single_elimination',
};

export const TournamentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    format: TournamentFormatSchema,
    status: TournamentStatusSchema,
    maxParticipants: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    startAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    completedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'description', 'format', 'status', 'createdAt', 'updatedAt'],
};

export const TournamentParticipantStatusSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 32,
  description: 'Registration status for a participant (pending, accepted, eliminated, etc.)',
};

export const TournamentParticipantSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
    tournamentId: { type: 'integer', minimum: 1 },
    userUuid: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
    alias: { type: 'string', minLength: 1 },
    seed: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    status: TournamentParticipantStatusSchema,
    joinedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'tournamentId', 'alias', 'status', 'joinedAt'],
};

export const TournamentMatchStatusSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 32,
  description: 'Status for a bracket match (pending, scheduled, in_progress, completed, etc.)',
};

export const TournamentMatchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
    tournamentId: { type: 'integer', minimum: 1 },
    roundNumber: { type: 'integer', minimum: 1 },
    roundPosition: { type: 'integer', minimum: 1 },
    status: TournamentMatchStatusSchema,
    matchId: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    scheduledAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    completedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
  },
  required: ['id', 'tournamentId', 'roundNumber', 'roundPosition', 'status'],
};

export const TournamentMatchPlayerSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
    tournamentMatchId: { type: 'integer', minimum: 1 },
    participantId: { type: 'integer', minimum: 1 },
    teamNumber: { type: 'integer', minimum: 1 },
  },
  required: ['id', 'tournamentMatchId', 'participantId', 'teamNumber'],
};

export const TournamentMatchHistoryEntrySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    gameIndex: { type: 'integer', minimum: 1 },
    east: { type: 'integer', minimum: 0 },
    west: { type: 'integer', minimum: 0 },
    winner: { type: 'string', enum: ['east', 'west'] },
  },
  required: ['gameIndex', 'east', 'west', 'winner'],
};

export const TournamentMatchResultReportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    winnerParticipantId: { type: 'integer', minimum: 1 },
    loserParticipantId: { type: 'integer', minimum: 1 },
    winnerUserUuid: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
    loserUserUuid: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
    gamesHistory: {
      type: 'array',
      items: TournamentMatchHistoryEntrySchema,
    },
  },
  required: ['winnerParticipantId', 'loserParticipantId'],
};
