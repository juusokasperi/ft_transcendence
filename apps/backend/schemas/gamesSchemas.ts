import { ErrorResponseSchema } from './responseSchemas';

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
        description: 'Array of player UUIDs for team 1'
      },
      team2Players: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 2,
        description: 'Array of player UUIDs for team 2'
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
      tournamentId: {
        type: 'integer',
        minimum: 1,
        description: 'Optional tournament ID'
      },
      tournamentStage: {
        type: 'string',
        enum: ['quarterfinal', 'semifinal', 'final' ], // Add what is needed..
        description: 'Tournament stage',
      },
    },
    additionalProperties: false
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
            team2: { type: 'number'},
          },
        },
      },
    },
    500: ErrorResponseSchema,
  },
};
