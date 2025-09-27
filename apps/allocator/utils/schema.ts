export const AllocateSchema = {
  body: {
    type: 'object',
    required: ['idempotencyKey', 'mode', 'region', 'players', 'simulationStartTick', 'randomSeed'],
    properties: {
      idempotencyKey: { type: 'string', format: 'uuid' },
      mode: { type: 'string', enum: ['ranked'] },
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
          },
        },
      },
      simulationStartTick: { type: 'number' },
      randomSeed: { type: 'integer' },
    },
  },
};
