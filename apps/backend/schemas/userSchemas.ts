import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
  SuccessResponseSchema,
  UsersSchema,
  SettingsSchema,
} from './responseSchemas.ts';

import {
  UsernameSchema,
  UuidSchema,
  PassSchema,
  PaddleColorSchema,
  ColorBlindSchema,
  PhotoSensitiveSchema,
  EmailSchema,
} from './fieldSchemas.ts';

const TwoFactorSetupResponseSchema = {
  type: 'object',
  required: ['secret', 'otpauthUrl'],
  properties: {
    secret: { type: 'string' },
    otpauthUrl: { type: 'string' },
  },
};

const TwoFactorConfirmBodySchema = {
  type: 'object',
  required: ['code'],
  properties: {
    code: {
      type: 'string',
      minLength: 3,
      maxLength: 10,
    },
  },
  additionalProperties: false,
};

export const getAllUsersSchema = {
  tags: ['User'],
  summary: 'Get all users from database',
  response: {
    200: {
      type: 'array',
      items: UsersSchema,
    },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const getUserSchema = {
  tags: ['User'],
  summary: 'Get user by UUID',
  params: {
    type: 'object',
    required: ['uuid'],
    properties: {
      uuid: UuidSchema,
    },
  },
  response: {
    200: UsersSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const USER_ROUTE_SECURITY = [
  { bearerAuth: [] as readonly string[] } as Record<string, readonly string[]>,
  { tokenAuth: [] as readonly string[] } as Record<string, readonly string[]>,
] as ReadonlyArray<Record<string, readonly string[]>>;

export const getMeSchema = {
  tags: ['User'],
  summary: 'Get the currently authenticated user',
  security: USER_ROUTE_SECURITY,
  querystring: {
    type: 'object',
    properties: {
      pass: {
        type: 'string',
        enum: ['yes', 'no'],
        description: 'Return boolean whether user has set up a password',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        username: UsernameSchema,
        uuid: UuidSchema,
        email: EmailSchema,
        avatar: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        tfa: { type: 'boolean' },
        hasPass: { type: 'boolean' },
      },
    },
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const userDeleteSchema = {
  tags: ['User'],
  summary: "Mark user for deletion and send a confirmation link to user's email",
  security: USER_ROUTE_SECURITY,
  response: {
    200: SuccessResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const userDeleteConfirmSchema = {
  tags: ['User'],
  summary: 'Delete user from database',
  security: USER_ROUTE_SECURITY,
  params: {
    type: 'object',
    required: ['token'],
    properties: {
      token: {
        type: 'string',
        minLength: 64,
        maxLength: 64,
        pattern: '^[a-f0-9]+$',
        description: 'User deletion token from email',
      },
    },
    additionalProperties: false,
  },
  response: {
    204: { type: 'null' },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const updateUsernameSchema = {
  tags: ['User'],
  summary: 'Update username',
  security: USER_ROUTE_SECURITY,
  body: {
    type: 'object',
    properties: {
      newUsername: UsernameSchema,
    },
    additionalProperties: false,
    required: ['newUsername'],
  },
  response: {
    200: UsersSchema,
    404: ErrorResponseSchema,
    400: ValidationErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const updateEmailSchema = {
  tags: ['User'],
  summary: 'Update email address',
  security: USER_ROUTE_SECURITY,
  body: {
    type: 'object',
    properties: {
      newEmail: EmailSchema,
    },
    additionalProperties: false,
    required: ['newEmail'],
  },
  response: {
    200: SuccessResponseSchema,
    404: ErrorResponseSchema,
    400: ValidationErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const emailConfirmSchema = {
  tags: ['User'],
  summary: 'Confirm email change',
  params: {
    type: 'object',
    required: ['token'],
    properties: {
      token: {
        type: 'string',
        minLength: 64,
        maxLength: 64,
        pattern: '^[a-f0-9]+$',
        description: 'Email change confirmation token from email',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const updatePassSchema = {
  tags: ['User'],
  summary: 'Update password',
  security: USER_ROUTE_SECURITY,
  body: {
    type: 'object',
    properties: {
      currentPassword: PassSchema,
      newPassword: PassSchema,
    },
    additionalProperties: false,
    required: ['newPassword'],
  },
  response: {
    200: SuccessResponseSchema,
    400: ValidationErrorResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const updateAvatarSchema = {
  tags: ['User'],
  summary: 'Update avatar picture',
  security: USER_ROUTE_SECURITY,
  consumes: ['multipart/form-data'],
  response: {
    200: UsersSchema,
    400: ValidationErrorResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const deleteAvatarSchema = {
  tags: ['User'],
  summary: "Delete users's avatar pic",
  security: USER_ROUTE_SECURITY,
  response: {
    200: UsersSchema,
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const getSettingsSchema = {
  tags: ['User'],
  summary: "Get user's profile settings",
  security: USER_ROUTE_SECURITY,
  response: {
    200: SettingsSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const updateSettingsSchema = {
  tags: ['User'],
  summary: "Update user's profile settings",
  security: USER_ROUTE_SECURITY,
  body: {
    type: 'object',
    properties: {
      paddleColor: PaddleColorSchema,
      colorBlindMode: ColorBlindSchema,
      photoSensitiveMode: PhotoSensitiveSchema,
    },
    required: [],
    additionalProperties: false,
  },
  response: {
    200: SettingsSchema,
    400: ValidationErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const twoFactorSetupSchema = {
  tags: ['User'],
  summary: 'Start two-factor authentication setup',
  security: USER_ROUTE_SECURITY,
  response: {
    200: TwoFactorSetupResponseSchema,
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const twoFactorConfirmSchema = {
  tags: ['User'],
  summary: 'Confirm two-factor authentication and enable it',
  security: USER_ROUTE_SECURITY,
  body: TwoFactorConfirmBodySchema,
  response: {
    200: SuccessResponseSchema,
    400: ValidationErrorResponseSchema,
    401: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const twoFactorDisableSchema = {
  tags: ['User'],
  summary: 'Disable two-factor authentication for the current user',
  security: USER_ROUTE_SECURITY,
  response: {
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};
