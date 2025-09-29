import {
  UsernameSchema,
  UuidSchema,
  PaddleColorSchema,
  ColorBlindSchema,
  PhotoSensitiveSchema,
} from './fieldSchemas';

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
  },
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
    online: { type: 'boolean' },
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
