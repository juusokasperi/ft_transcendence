import {
  SuccessResponseSchema,
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
} from './responseSchemas.ts';
import {
  PassSchema,
  UsernameSchema,
  EmailSchema,
  UuidSchema,
  AvatarSchema,
} from './fieldSchemas.ts';

const SignupBodySchema = {
  type: 'object',
  required: ['username', 'email', 'password'],
  properties: {
    username: UsernameSchema,
    email: EmailSchema,
    password: PassSchema,
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

const LoginTwoFactorBodySchema = {
  type: 'object',
  required: ['token', 'code'],
  properties: {
    token: {
      type: 'string',
      minLength: 10,
      description: 'Temporary JWT issued after first step of login',
    },
    code: {
      type: 'string',
      minLength: 3,
      maxLength: 10,
      description: 'One-time code from authenticator app',
    },
  },
  additionalProperties: false,
};

const ResetPassBodySchema = {
  type: 'object',
  required: ['newPassword'],
  properties: {
    newPassword: PassSchema,
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
      oneOf: [
        {
          type: 'object',
          required: ['user'],
          properties: {
            user: {
              type: 'object',
              properties: {
                username: UsernameSchema,
                uuid: UuidSchema,
                avatar: AvatarSchema,
                email: EmailSchema,
                tfa: { type: 'boolean' },
                wins: { type: 'integer', minimum: 0 },
                losses: { type: 'integer', minimum: 0 },
                createdAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['twoFactorRequired', 'pendingToken'],
          properties: {
            twoFactorRequired: { const: true },
            pendingToken: { type: 'string' },
            method: { type: 'string' },
          },
        },
      ],
    },
    400: ValidationErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const loginTwoFactorSchema = {
  tags: ['Auth'],
  summary: 'Completes login by verifying the 2FA code and issuing JWT',
  body: LoginTwoFactorBodySchema,
  response: {
    200: {
      type: 'object',
      required: ['user'],
      properties: {
        user: {
          type: 'object',
          properties: {
            username: UsernameSchema,
            uuid: UuidSchema,
            avatar: AvatarSchema,
            email: EmailSchema,
            tfa: { type: 'boolean' },
            wins: { type: 'integer', minimum: 0 },
            losses: { type: 'integer', minimum: 0 },
            createdAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
      },
    },
    400: ValidationErrorResponseSchema,
    401: ErrorResponseSchema,
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
    required: ['resetToken'],
    properties: {
      resetToken: {
        type: 'string',
        minLength: 64,
        maxLength: 64,
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
  security: [
    { bearerAuth: [] as readonly string[] },
    { tokenAuth: [] as readonly string[] },
  ] as ReadonlyArray<Record<string, readonly string[]>>,
  response: {
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};
