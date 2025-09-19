import { ErrorResponseSchema } from './responseSchemas.ts';
import {
  MatchSchema,
  TournamentIDSchema,
  TournamentStageSchema,
  UuidSchema,
  MatchPlayerStatsArraySchema,
} from './fieldSchemas.ts';

export const addMatchSchema = {
  tags: ['Match'],
  summary: 'Add match results to database and update rankings',
  body: {
    type: 'object',
    properties: {
      team1Players: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 2,
        description: 'Array of player UUIDs for team 1',
      },
      team2Players: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 2,
        description: 'Array of player UUIDs for team 2',
      },
      team1Score: {
        type: 'integer',
        minimum: 0,
        description: 'Final score for team 1',
      },
      team2Score: {
        type: 'integer',
        minimum: 0,
        description: 'Final score for team 2',
      },
      tournamentId: TournamentIDSchema,
      tournamentStage: TournamentStageSchema,
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        matchId: { type: 'number' },
        eloChanges: {
          type: 'object',
          properties: {
            team1: { type: 'number' },
            team2: { type: 'number' },
          },
        },
      },
    },
    500: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
  },
};

export const getMatchSchema = {
  tags: ['Match'],
  summary: 'Get single match results from DB',
  params: {
    type: 'object',
    required: ['matchId'],
    properties: {
      matchId: { type: 'number', minimum: 0 },
    },
  },
  response: {
    200: MatchSchema,
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const MatchesQuerySchema = {
  type: 'object',
  properties: {
    count: {
      type: 'number',
      minimum: 1,
      description: 'Optional limit on number of matches to return',
    },
    offset: {
      type: 'number',
      minimum: 0,
      description: 'Optional offset for matches fetching',
    },
  },
};

export const getMyMatchesSchema = {
  tags: ['Match'],
  summary: 'Get matches for authenticated user',
  querystring: MatchesQuerySchema,
  response: {
    200: {
      type: 'array',
      items: MatchSchema,
    },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const getUserMatchesSchema = {
  tags: ['Match'],
  summary: 'Get matches for another user by UUID',
  params: {
    type: 'object',
    properties: {
      uuid: UuidSchema,
    },
    required: ['uuid'],
  },
  querystring: MatchesQuerySchema,
  response: {
    200: {
      type: 'array',
      items: MatchSchema,
    },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const addMatchStatsSchema = {
  tags: ['Match'],
  summary: 'Attach per-player stats to an existing match',
  params: {
    type: 'object',
    required: ['matchId'],
    properties: {
      matchId: { type: 'number', minimum: 1 },
    },
  },
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      players: MatchPlayerStatsArraySchema,
    },
    required: ['players'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        updated: { type: 'number' },
      },
    },
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

// No standalone GET /:matchId/stats schema; stats are embedded in match payloads.
