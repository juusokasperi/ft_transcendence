import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { deleteFriend, addFriend, respondToFriendReq, getFriends, getPendingFriendRequestsSent, getPendingFriendRequestsReceived } from '../db/queries/friends.ts';
import { getUser } from '../db/queries/users.ts';
import { authPreHandler, tokenUuidCheck } from '../hooks/auth.ts';

export async function friendsRoutes(app: FastifyInstance) {
	// Get all (accepted) friends of user
	app.get('/', { preHandler: [authPreHandler, tokenUuidCheck] }, async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const uuid = req.user!.uuid;
			const results = getFriends(uuid);
			if (!results)
				return res.status(500).send({ error: 'Failed to get friends' });
			return res.status(200).send(results);
		} catch (error) {
			return res.status(500).send({ error: 'Failed to get friends' });
		}
	});

	// Get all received pending friend reqs of user
	app.get('/pending/received', { preHandler: [authPreHandler, tokenUuidCheck] }, async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const uuid = req.user!.uuid;
			const results = getPendingFriendRequestsReceived(uuid);
			if (!results)
				return res.status(500).send({ error: 'Failed to get pending friends' });
			return res.status(200).send(results);
		} catch (error) {
			return res.status(500).send({ error: 'Failed to get pending friends' });
		}
	});

	// Get all sent pending friend reqs of user
	app.get('/pending/sent', { preHandler: [authPreHandler, tokenUuidCheck] }, async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const uuid = req.user!.uuid;
			const results = getPendingFriendRequestsSent(uuid);
			if (!results)
				return res.status(500).send({ error: 'Failed to get pending friends' });
			return res.status(200).send(results);
		} catch (error) {
			return res.status(500).send({ error: 'Failed to get pending friends' });
		}
	});

	// Accept or decline a friend request
	app.patch('/respond/:senderUuid', { preHandler: [authPreHandler, tokenUuidCheck] }, async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const recipientUuid = req.user!.uuid;
			const { senderUuid } = req.params as { senderUuid: string };
			const { accept } = req.body as { accept: boolean };
			if (typeof accept !== 'boolean')
				return res.status(400).send({ error: 'Missing \'accept\' boolean from request body' });
			const result = respondToFriendReq(recipientUuid, senderUuid, accept);
			if (!result)
				return res.status(400).send({ error: 'No pending request found.' });
			res.status(200).send();
		} catch (error) {
			return res.status(500).send({ error: 'Failed to respond to friend request' });
		}
	})

	// Send a friend request
	app.post('/:user2Identifier', { preHandler: [authPreHandler, tokenUuidCheck] }, async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const user1Uuid = req.user!.uuid;
			const { user2Identifier } = req.params as { user2Identifier: string };

			const userResult = getUser(user2Identifier);
			if (!userResult)
				return res.status(400).send({ error: 'Target of friend request not existing.' });

			const user2Uuid = userResult.uuid;
			const result = addFriend(user1Uuid, user2Uuid);
			if (!result)
				return res.status(400).send({ error: 'Already friends or request pending' });
			res.status(201).send();
		} catch (error) {
			return res.status(500).send({ error: 'Failed to send friend request' });
		}
	});

	// Remove friend from friends list
	app.delete('/:user2Uuid', { preHandler: [authPreHandler, tokenUuidCheck] }, async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { user2Uuid } = req.params as { user2Uuid: string };
			const user1Uuid = req.user!.uuid;
			const result = deleteFriend(user1Uuid, user2Uuid);
			if (!result)
				return res.status(400).send({ error: 'No friendship found with supplied UUIDs.' });
			res.status(204).send();
		} catch (error ) {
			return res.status(500).send({ error: 'Failed to delete friendship' });
		}
	});
};
