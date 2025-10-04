import { ErrorResponseSchema } from './responseSchemas.ts';
import {
  MatchSchema,
  TournamentIDSchema,
  TournamentStageSchema,
  UuidSchema,
  MatchPlayerStatsArraySchema,
  UserStatsSchema,
} from './fieldSchemas.ts';
import { USER_ROUTE_SECURITY } from './userSchemas.ts';

const MATCH_ROUTE_SECURITY = [
  { bearerAuth: [] as readonly string[] } as Record<string, readonly string[]>,
] as ReadonlyArray<Record<string, readonly string[]>>;

export const addMatchSchema = {
  tags: ['Match'],
  summary: 'Add match results to database and update rankings',
  security: MATCH_ROUTE_SECURITY,
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
  security: USER_ROUTE_SECURITY,
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

export const getMyStatsSchema = {
  tags: ['Match'],
  security: USER_ROUTE_SECURITY,
  summary: 'Get stats for authenticated user',
  response: {
    200: UserStatsSchema,
    500: ErrorResponseSchema,
  },
};

export const getUserStatsSchema = {
  tags: ['Match'],
  security: USER_ROUTE_SECURITY,
  summary: 'Get stats for another user',
  params: {
    type: 'object',
    properties: {
      uuid: UuidSchema,
    },
    required: ['uuid'],
  },
  response: {
    200: UserStatsSchema,
    500: ErrorResponseSchema,
  },
};

export const getMyMatchesSchema = {
  tags: ['Match'],
  summary: 'Get matches for authenticated user',
  security: USER_ROUTE_SECURITY,
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
  security: USER_ROUTE_SECURITY,
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
  security: MATCH_ROUTE_SECURITY,
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
