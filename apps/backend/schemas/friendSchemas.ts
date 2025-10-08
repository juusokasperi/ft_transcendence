import {
  ErrorResponseSchema,
  SuccessResponseSchema,
  UsersSchema,
  PublicUsersSchema,
} from './responseSchemas.ts';
import { UsernameSchema, UuidSchema, EmailSchema } from './fieldSchemas.ts';

const FRIEND_ROUTE_SECURITY: ReadonlyArray<Record<string, readonly string[]>> = [
  { bearerAuth: [] as readonly string[] },
  { tokenAuth: [] as readonly string[] },
];

export const friendsSchema = {
  tags: ['Friends'],
  summary: 'Get all friends of user',
  security: FRIEND_ROUTE_SECURITY,
  response: {
    200: {
      type: 'array',
      items: UsersSchema,
    },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const pendingSchema = {
  tags: ['Friends'],
  summary: 'Get all sent or received pending friend requests',
  security: FRIEND_ROUTE_SECURITY,
  response: {
    200: {
      type: 'array',
      items: PublicUsersSchema,
    },
    500: ErrorResponseSchema,
  },
};

export const respondFriendSchema = {
  tags: ['Friends'],
  summary: 'Respond to a received friend request',
  security: FRIEND_ROUTE_SECURITY,
  body: {
    type: 'object',
    properties: {
      accept: {
        type: 'boolean',
      },
    },
    required: ['accept'],
    additionalProperties: false,
  },
  response: {
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const sendFriendSchema = {
  tags: ['Friends'],
  summary: 'Send a friend request to another user',
  security: FRIEND_ROUTE_SECURITY,
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
    200: SuccessResponseSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const deleteFriendSchema = {
  tags: ['Friends'],
  summary: 'Delete an existing friendship',
  security: FRIEND_ROUTE_SECURITY,
  params: {
    type: 'object',
    required: ['user2Uuid'],
    properties: {
      user2Uuid: UuidSchema,
    },
  },
  response: {
    204: SuccessResponseSchema,
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const checkFriendSchema = {
  tags: ['Friends'],
  summary: 'Check if two users are friended',
  security: FRIEND_ROUTE_SECURITY,
  params: {
    type: 'object',
    required: ['user2Uuid'],
    properties: {
      user2Uuid: UuidSchema,
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['friends', 'request_sent', 'request_received', 'none'],
        },
      },
      required: ['status'],
    },
    400: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};
