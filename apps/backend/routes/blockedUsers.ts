import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getBlockedUsernames, blockUser, unblockUser } from '../db/queries/blockedUsers.ts';
import { getUser } from '../db/queries/users.ts';
import { authPreHandler, tokenUuidCheck } from '../hooks/auth.ts';
import {
  getBlockedUsersSchema,
  blockUserSchema,
  unblockUserSchema,
} from '../schemas/blockedUserSchemas.ts';

export async function blockedUsersRoutes(app: FastifyInstance) {
  // Get all usernames the current user has blocked
  app.get(
    '/',
    {
      schema: getBlockedUsersSchema,
      preHandler: [authPreHandler, tokenUuidCheck],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const blocked = getBlockedUsernames(uuid);
        if (!blocked) return res.status(500).send({ message: 'Failed to get blocked users' });
        return res.status(200).send(blocked);
      } catch (error) {
        return res.status(500).send({ message: 'Failed to get blocked users' });
      }
    },
  );

  // Block a user (identifier can be username / uuid / email)
  app.post(
    '/',
    {
      schema: blockUserSchema,
      preHandler: [authPreHandler, tokenUuidCheck],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const blockerUuid = req.user!.uuid;
        const identifier = (req.body as { username: string }).username;

        const userResult = getUser(identifier);
        if (!userResult) {
          return res.status(400).send({ message: 'Target user not found.' });
        }

        const blockedUuid = userResult.uuid;

        if (blockedUuid === blockerUuid) {
          return res.status(400).send({ message: 'You cannot block yourself.' });
        }

        const result = blockUser(blockerUuid, blockedUuid);
        if (!result) {
          return res.status(400).send({ message: 'Could not block user (maybe already blocked).' });
        }

        return res.status(201).send({ success: 'User successfully blocked' });
      } catch (error) {
        return res.status(500).send({ message: 'Failed to block user' });
      }
    },
  );

  // Unblock a user by their username

  app.delete(
    '/',
    {
      schema: unblockUserSchema,
      preHandler: [authPreHandler, tokenUuidCheck],
    },
    async (req, res) => {
      try {
        const blockerUuid = req.user!.uuid;
        const { username } = req.body as { username: string };

        const user = getUser(username);
        if (!user) {
          return res.status(400).send({ message: 'User not found' });
        }

        const ok = unblockUser(blockerUuid, user.uuid);
        if (!ok) {
          return res.status(400).send({ message: 'User was not blocked' });
        }

        return res.status(204).send();
      } catch (err) {
        return res.status(500).send({ message: 'Failed to unblock user' });
      }
    },
  );
}
