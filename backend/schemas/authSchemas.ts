import {
  PassSchema,
  SuccessResponseSchema,
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
  UsernameSchema,
  EmailSchema,
  UuidSchema,
} from './sharedSchemas.ts';

const SignupBodySchema = {
  type: 'object',
  required: ['username', 'email'],
  properties: {
    username: UsernameSchema,
    email: EmailSchema,
    password: PassSchema,
    googleAuth: {
      type: 'string',
      description: 'Google auth token (optional)',
    },
  },
  additionalProperties: false,
};

const LoginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: EmailSchema,
    password: PassSchema,
  },
  additionalProperties: false,
};

const ResetPassBodySchema = {
  type: 'object',
  required: ['newPassword'],
  properties: {
    password: PassSchema,
  },
  additionalProperties: false,
};

export const signupSchema = {
  tags: ['Auth'],
  summary: 'Creates a new user account and sends a confirmation email to client',
  body: SignupBodySchema,
  response: {
    200: SuccessResponseSchema,
    400: ValidationErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const signupConfirmSchema = {
  tags: ['Auth'],
  summary: 'Confirms a new user account and returns a JWT token to the client',
  response: {
    200: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'JWT authentication token',
        },
        user: {
          type: 'object',
          properties: {
            username: UsernameSchema,
            uuid: UuidSchema,
          },
        },
      },
    },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const loginSchema = {
  tags: ['Auth'],
  summary: 'Sends a valid JWT token for the user',
  body: LoginBodySchema,
  response: {
    200: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'JWT authentication token',
        },
        user: {
          type: 'object',
          properties: {
            username: UsernameSchema,
            uuid: UuidSchema,
          },
        },
      },
    },
    400: ValidationErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const resetPassSchema = {
  tags: ['Auth'],
  summary: "Sends a reset password link to user's email address",
  body: {
    type: 'object',
    properties: {
      email: EmailSchema,
    },
    required: ['email'],
  },
  response: {
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const resetPassConfirmSchema = {
  tags: ['Auth'],
  summary: "Resets user's password.",
  params: {
    type: 'object',
    required: ['token'],
    properties: {
      token: {
        type: 'string',
        minLength: 32,
        maxLength: 32,
        pattern: '^[a-f0-9]+$',
        description: 'Password reset token from email',
      },
    },
    additionalProperties: false,
  },
  body: ResetPassBodySchema,
};

export const logoutSchema = {
  tags: ['Auth'],
  summary: "Moves user's last_seen field back 10 minutes to appear offline",
  security: [{ bearerAuth: [] }],
  response: {
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};
