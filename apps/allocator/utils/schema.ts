/**
 * JSON schema for the `/allocate` request body.
 *
 * Used by Fastify to validate allocator requests before processing. Fields:
 *  - idempotencyKey: UUID used to deduplicate repeated allocation attempts.
 *  - mode: "ranked" | "tournament" | "invite".
 *  - players: list of players with identifiers, sides, and MMR (plus optional tournament fields).
 *  - simulationStartTick: target simulation start time (epoch ms).
 *  - randomSeed: seed passed to the game node for deterministic physics.
 *  - tournament: tournament context (when mode === 'tournament').
 */
export const AllocateSchema = {
  body: {
    type: 'object',
    required: ['idempotencyKey', 'mode', 'players', 'simulationStartTick', 'randomSeed'],
    properties: {
      idempotencyKey: { type: 'string', format: 'uuid' },
      mode: { type: 'string', enum: ['ranked', 'tournament', 'invite'] },
      players: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['playerIdentifier', 'side', 'mmr'],
          properties: {
            playerIdentifier: { type: 'string', format: 'uuid' },
            side: { type: 'string', enum: ['west', 'east'] },
            tournamentParticipantId: { type: 'integer', minimum: 1 },
            alias: { type: 'string' },
            mmr: { type: 'number' },
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
