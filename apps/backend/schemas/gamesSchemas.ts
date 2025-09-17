import { ErrorResponseSchema } from './responseSchemas.ts';
import {
  GameSchema,
  TournamentIDSchema,
  TournamentStageSchema,
  UuidSchema,
} from './fieldSchemas.ts';

export const addGameSchema = {
  tags: ['Game'],
  summary: 'Add game results to database and update rankings',
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
        gameId: { type: 'number' },
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

export const getGameSchema = {
  tags: ['Game'],
  summary: 'Get single game results from DB',
  params: {
    type: 'object',
    required: ['gameId'],
    properties: {
      gameId: { type: 'number', minimum: 0 },
    },
  },
  response: {
    200: GameSchema,
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const GamesQuerySchema = {
  type: 'object',
  properties: {
    count: {
      type: 'number',
      minimum: 1,
      description: 'Optional limit on number of games to return',
    },
    offset: {
      type: 'number',
      minimum: 0,
      description: 'Optional offset for games fetching',
    },
  },
};

export const getMyGamesSchema = {
  tags: ['Game'],
  summary: 'Get games for authenticated user',
  querystring: GamesQuerySchema,
  response: {
    200: {
      type: 'array',
      items: GameSchema,
    },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const getUserGamesSchema = {
  tags: ['Game'],
  summary: 'Get games for another user by UUID',
  params: {
    type: 'object',
    properties: {
      uuid: UuidSchema,
    },
    required: ['uuid'],
  },
  querystring: GamesQuerySchema,
  response: {
    200: {
      type: 'array',
      items: GameSchema,
    },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};
