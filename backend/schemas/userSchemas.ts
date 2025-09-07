import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
  SuccessResponseSchema,
  UsersSchema,
  SettingsSchema
} from './responseSchemas.ts';

import {
  UsernameSchema,
  UuidSchema,
  PassSchema,
  PaddleColorSchema,
  ColorBlindSchema,
  PhotoSensitiveSchema
} from './fieldSchemas.ts';


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

export const userDeleteSchema = {
  tags: ['User'],
  summary: "Mark user for deletion and send a confirmation link to user's email",
  security: [{ bearerAuth: [] }],
  response: {
    200: SuccessResponseSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const userDeleteConfirmSchema = {
  tags: ['User'],
  summary: 'Delete user from database',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['token'],
    properties: {
      token: {
        type: 'string',
        minLength: 32,
        maxLength: 32,
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
  security: [{ bearerAuth: [] }],
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

export const updatePassSchema = {
  tags: ['User'],
  summary: 'Update password',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      currentPassword: PassSchema,
      newPassword: PassSchema,
    },
    additionalProperties: false,
    required: ['currentPassword', 'newPassword'],
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
  security: [{ bearerAuth: [] }],
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
    properties: {
      avatar: {
        type: 'string',
        format: 'binary',
        description: 'Avatar image file (max 1MB)',
      },
    },
    required: ['avatar'],
  },
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
  security: [{ bearerAuth: [] }],
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
  security: [{ bearerAuth: [] }],
  response: {
    200: SettingsSchema,
    404: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const updateSettingsSchema = {
  tags: ['User'],
  summary: "Update user's profile settings",
  security: [{ bearerAuth: [] }],
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
