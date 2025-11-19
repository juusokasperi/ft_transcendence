import { ErrorResponseSchema, SuccessResponseSchema } from './responseSchemas.ts';
import { UsernameSchema, UuidSchema, EmailSchema } from './fieldSchemas.ts';

const BLOCKED_ROUTE_SECURITY: ReadonlyArray<Record<string, readonly string[]>> = [
  { bearerAuth: [] as readonly string[] },
  { tokenAuth: [] as readonly string[] },
];

export const getBlockedUsersSchema = {
  tags: ['Blocked Users'],
  summary: 'Get all usernames blocked by the current user',
  security: BLOCKED_ROUTE_SECURITY,
  response: {
    200: {
      type: 'array',
      items: UsernameSchema,
    },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const blockUserSchema = {
  tags: ['Blocked Users'],
  summary: 'Block a user',
  security: BLOCKED_ROUTE_SECURITY,
  body: {
    type: 'object',
    properties: {
      username: {
        anyOf: [{ ...UsernameSchema }, { ...UuidSchema }, { ...EmailSchema }],
      },
    },
    required: ['username'],
    additionalProperties: false,
  },
  response: {
    201: SuccessResponseSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const unblockUserSchema = {
  tags: ['Blocked Users'],
  summary: 'Unblock a user',
  security: BLOCKED_ROUTE_SECURITY,
  body: {
    type: 'object',
    properties: {
      username: { ...UsernameSchema },
    },
    required: ['username'],
    additionalProperties: false,
  },
  response: {
    204: SuccessResponseSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};
