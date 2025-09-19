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
      pointsAwarded: { type: 'number' },
    },
    required: ['uuid', 'username', 'ranking', 'createdAt', 'pointsAwarded'],
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
      enum: ['quarterfinal', 'semifinal', 'final'],
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
