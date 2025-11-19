import {
  UsernameSchema,
  UuidSchema,
  PaddleColorSchema,
  ColorBlindSchema,
  PhotoSensitiveSchema,
} from './fieldSchemas.ts';

export const SuccessResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'string' },
  },
};

export const ValidationErrorResponseSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          type: { type: 'string' },
          message: { type: 'string' },
          expected: { type: 'number' },
          actual: { type: 'number' },
        },
      },
    },
  },
};

export const ErrorResponseSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    code: { type: 'string' },
    tournamentId: { type: 'integer' },
  },
  additionalProperties: true,
};

export const UsersSchema = {
  type: 'object',
  properties: {
    username: UsernameSchema,
    uuid: UuidSchema,
    avatar: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    ranking: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
    wins: { type: 'integer' },
    losses: { type: 'integer' },
    totalMatches: { type: 'integer' },
  },
};

export const PublicUsersSchema = {
  type: 'object',
  properties: {
    uuid: UuidSchema,
    username: UsernameSchema,
    avatar: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    ranking: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const SettingsSchema = {
  type: 'object',
  properties: {
    uuid: UuidSchema,
    paddleColor: PaddleColorSchema,
    colorBlindMode: ColorBlindSchema,
    photoSensitiveMode: PhotoSensitiveSchema,
  },
};
