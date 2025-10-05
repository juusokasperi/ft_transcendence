import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
} from './responseSchemas.ts';
import {
  TournamentSchema,
  TournamentStatusSchema,
  TournamentParticipantSchema,
  TournamentParticipantStatusSchema,
  TournamentMatchSchema,
  TournamentMatchStatusSchema,
  TournamentMatchPlayerSchema,
  TournamentFormatSchema,
} from './fieldSchemas.ts';
import { USER_ROUTE_SECURITY } from './userSchemas.ts';


const BracketSummarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tournamentId: { type: 'integer', minimum: 1 },
    participantCount: { type: 'integer', minimum: 0 },
    bracketSize: { type: 'integer', minimum: 0 },
    totalRounds: { type: 'integer', minimum: 0 },
    createdMatches: { type: 'integer', minimum: 0 },
    assignedParticipants: { type: 'integer', minimum: 0 },
    readyMatches: { type: 'array', items: { type: 'integer', minimum: 1 } },
    autoAdvancedMatches: { type: 'array', items: { type: 'integer', minimum: 1 } },
    skippedReason: {
      anyOf: [
        { type: 'string', enum: ['awaitingParticipants', 'matchesAlreadyExist'] },
        { type: 'null' },
      ],
    },
  },
  required: [
    'tournamentId',
    'participantCount',
    'bracketSize',
    'totalRounds',
    'createdMatches',
    'assignedParticipants',
  ],
};

const tournamentIdParams = {
  type: 'object',
  required: ['tournamentId'],
  properties: {
    tournamentId: { type: 'integer', minimum: 1 },
  },
  additionalProperties: false,
};

export const listTournamentsSchema = {
  tags: ['Tournament'],
  summary: 'List tournaments with optional status filter',
  querystring: {
    type: 'object',
    properties: {
      status: TournamentStatusSchema,
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'array',
      items: TournamentSchema,
    },
    500: ErrorResponseSchema,
  },
};

export const createTournamentSchema = {
  tags: ['Tournament'],
  summary: 'Create a new tournament',
  security: USER_ROUTE_SECURITY,
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 128 },
      description: { type: 'string', maxLength: 2048, default: '' },
      format: TournamentFormatSchema,
      status: TournamentStatusSchema,
      maxParticipants: { anyOf: [{ type: 'integer', minimum: 2 }, { type: 'null' }] },
      startAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    },
    additionalProperties: false,
  },
  response: {
    201: TournamentSchema,
    400: ValidationErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const getTournamentSchema = {
  tags: ['Tournament'],
  summary: 'Get tournament by id',
  params: tournamentIdParams,
  response: {
    200: TournamentSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const updateTournamentStatusSchema = {
  tags: ['Tournament'],
  summary: 'Update tournament status',
  security: USER_ROUTE_SECURITY,
  params: tournamentIdParams,
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: TournamentStatusSchema,
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tournament: TournamentSchema,
        bracketSummary: BracketSummarySchema,
      },
      required: ['tournament'],
    },
    400: ValidationErrorResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const completeTournamentSchema = {
  tags: ['Tournament'],
  summary: 'Mark tournament as completed',
  security: USER_ROUTE_SECURITY,
  params: tournamentIdParams,
  response: {
    200: TournamentSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

const participantIdParams = {
  type: 'object',
  required: ['tournamentId', 'participantId'],
  properties: {
    tournamentId: { type: 'integer', minimum: 1 },
    participantId: { type: 'integer', minimum: 1 },
  },
  additionalProperties: false,
};

export const listParticipantsSchema = {
  tags: ['Tournament Participants'],
  summary: 'List participants for a tournament',
  params: tournamentIdParams,
  response: {
    200: {
      type: 'array',
      items: TournamentParticipantSchema,
    },
    500: ErrorResponseSchema,
  },
};

export const createParticipantSchema = {
  tags: ['Tournament Participants'],
  summary: 'Register a participant for a tournament',
  security: USER_ROUTE_SECURITY,
  params: tournamentIdParams,
  body: {
    type: 'object',
    required: ['alias'],
    properties: {
      alias: { type: 'string', minLength: 1, maxLength: 64 },
      userUuid: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
      seed: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
      status: TournamentParticipantStatusSchema,
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      additionalProperties: false,
      properties: {
        participant: TournamentParticipantSchema,
        activation: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                tournament: TournamentSchema,
                bracketSummary: BracketSummarySchema,
              },
              required: ['tournament', 'bracketSummary'],
            },
            { type: 'null' },
          ],
        },
      },
      required: ['participant'],
    },
    400: ValidationErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const updateParticipantSchema = {
  tags: ['Tournament Participants'],
  summary: 'Update participant alias, seed, status, or user link',
  security: USER_ROUTE_SECURITY,
  params: participantIdParams,
  body: {
    type: 'object',
    properties: {
      alias: { type: 'string', minLength: 1, maxLength: 64 },
      seed: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
      status: TournamentParticipantStatusSchema,
      userUuid: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
    },
    minProperties: 1,
    additionalProperties: false,
  },
  response: {
    200: TournamentParticipantSchema,
    400: ValidationErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const deleteParticipantSchema = {
  tags: ['Tournament Participants'],
  summary: 'Remove a participant from a tournament',
  security: USER_ROUTE_SECURITY,
  params: participantIdParams,
  response: {
    204: { type: 'null' },
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

const tournamentMatchParams = {
  type: 'object',
  required: ['tournamentId', 'matchId'],
  properties: {
    tournamentId: { type: 'integer', minimum: 1 },
    matchId: { type: 'integer', minimum: 1 },
  },
  additionalProperties: false,
};

export const listMatchesSchema = {
  tags: ['Tournament Matches'],
  summary: 'List bracket matches for a tournament',
  params: tournamentIdParams,
  response: {
    200: {
      type: 'array',
      items: TournamentMatchSchema,
    },
    500: ErrorResponseSchema,
  },
};

export const createMatchSchema = {
  tags: ['Tournament Matches'],
  summary: 'Create a bracket match slot',
  security: USER_ROUTE_SECURITY,
  params: tournamentIdParams,
  body: {
    type: 'object',
    required: ['roundNumber', 'roundPosition'],
    properties: {
      roundNumber: { type: 'integer', minimum: 1 },
      roundPosition: { type: 'integer', minimum: 1 },
      status: TournamentMatchStatusSchema,
      scheduledAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    },
    additionalProperties: false,
  },
  response: {
    201: TournamentMatchSchema,
    400: ValidationErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};


export const listMatchPlayersSchema = {
  tags: ['Tournament Matches'],
  summary: 'List participant assignments for a bracket match',
  params: tournamentMatchParams,
  response: {
    200: {
      type: 'array',
      items: TournamentMatchPlayerSchema,
    },
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const clearMatchPlayersSchema = {
  tags: ['Tournament Matches'],
  summary: 'Remove all participant assignments from a bracket match',
  security: USER_ROUTE_SECURITY,
  params: tournamentMatchParams,
  response: {
    204: { type: 'null' },
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const updateMatchSchema = {
  tags: ['Tournament Matches'],
  summary: 'Update match status, schedule, or linked match id',
  security: USER_ROUTE_SECURITY,
  params: tournamentMatchParams,
  body: {
    type: 'object',
    properties: {
      status: TournamentMatchStatusSchema,
      scheduledAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
      matchId: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
      setCompleted: { type: 'boolean' },
    },
    minProperties: 1,
    additionalProperties: false,
  },
  response: {
    200: TournamentMatchSchema,
    400: ValidationErrorResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

const matchPlayerParams = {
  type: 'object',
  required: ['tournamentId', 'matchId', 'matchPlayerId'],
  properties: {
    tournamentId: { type: 'integer', minimum: 1 },
    matchId: { type: 'integer', minimum: 1 },
    matchPlayerId: { type: 'integer', minimum: 1 },
  },
  additionalProperties: false,
};

export const addMatchPlayerSchema = {
  tags: ['Tournament Matches'],
  summary: 'Assign a participant to a bracket slot',
  security: USER_ROUTE_SECURITY,
  params: tournamentMatchParams,
  body: {
    type: 'object',
    required: ['participantId', 'teamNumber'],
    properties: {
      participantId: { type: 'integer', minimum: 1 },
      teamNumber: { type: 'integer', minimum: 1 },
    },
    additionalProperties: false,
  },
  response: {
    201: TournamentMatchPlayerSchema,
    400: ValidationErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const deleteMatchPlayerSchema = {
  tags: ['Tournament Matches'],
  summary: 'Remove a participant assignment from a bracket match',
  security: USER_ROUTE_SECURITY,
  params: matchPlayerParams,
  response: {
    204: { type: 'null' },
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};
