export const AllocateSchema = {
  body: {
    type: 'object',
    required: ['idempotencyKey', 'mode', 'region', 'players', 'simulationStartTick', 'randomSeed'],
    properties: {
      idempotencyKey: { type: 'string', format: 'uuid' },
      mode: { type: 'string', enum: ['ranked', 'tournament', 'invite'] },
      region: { type: 'string', minLength: 1 },
      players: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['playerIdentifier', 'side'],
          properties: {
            playerIdentifier: { type: 'string', format: 'uuid' },
            side: { type: 'string', enum: ['west', 'east'] },
            tournamentParticipantId: { type: 'integer', minimum: 1 },
            alias: { type: 'string' },
          },
        },
      },
      simulationStartTick: { type: 'number' },
      randomSeed: { type: 'integer' },
      tournament: {
        type: 'object',
        required: ['tournamentId', 'tournamentMatchId', 'tournamentStage'],
        additionalProperties: false,
        properties: {
          tournamentId: { type: 'integer', minimum: 1 },
          tournamentMatchId: { type: 'integer', minimum: 1 },
          tournamentStage: { type: 'string', enum: ['semifinal', 'final', 'bronze'] },
          participants: {
            type: 'array',
            items: {
              type: 'object',
              required: ['participantId', 'userUuid'],
              additionalProperties: false,
              properties: {
                participantId: { type: 'integer', minimum: 1 },
                userUuid: { type: 'string', format: 'uuid' },
                alias: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};
