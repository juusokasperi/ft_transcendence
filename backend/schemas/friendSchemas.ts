import {
  ErrorResponseSchema,
  UsernameSchema,
  UuidSchema,
  PassSchema,
  SuccessResponseSchema,
  UsersSchema,
  PublicUsersSchema,
  EmailSchema,
} from './sharedSchemas.ts';

export const friendsSchema = {
  tags: ['Friends'],
  summary: 'Get all friends of user',
  security: [{ bearerAuth: [] }],
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
  security: [{ bearerAuth: [] }],
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
  security: [{ bearerAuth: [] }],
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
  security: [{ bearerAuth: [] }],
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
  security: [{ bearerAuth: [] }],
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
