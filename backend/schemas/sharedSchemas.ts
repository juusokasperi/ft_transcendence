export const PassSchema = {
  type: 'string',
  minLength: 12,
  pattern: '^[a-zA-Z0-9!@#$%^&*()\-_=+[\\]{};:|,<.>/?]+$',
  description:
    'Password: Must contain uppercase, lowercase, digit and special character (!@#$%^&()-_=+[]{};:|,<.>/?',
};

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
    errors: {
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

export const UsernameSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 16,
  pattern: '^(?!-)(?!.*--)[a-zA-Z0-9-]+$',
  description:
    'Username: letters, numbers, dashes allowed. Cannot start with a dash or have consecutive dashes.',
};

export const EmailSchema = {
  type: 'string',
  format: 'email',
  description: 'User email address',
};

export const UuidSchema = {
  type: 'string',
  format: 'uuid',
  description: 'User unique id',
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
    totalGames: { type: 'integer' },
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
