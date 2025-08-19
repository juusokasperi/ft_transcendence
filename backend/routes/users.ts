import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import { SECRET } from '../utils/config.ts';
import { getUserStats, deleteUser, updateUser } from '../db/queries/users.ts';
import authPreHandler from '../hooks/auth.ts';

export async function userRoutes(app: FastifyInstance) {
	app.get('/', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const users = getUserStats();
			res.status(200).send(users);
		} catch (error) {
			res.status(500).send({ error: 'Failed to fetch users' });
		}
	});

	app.get('/:uuid', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { uuid } = req.params as { uuid: string };
			const user = getUserStats(uuid);
			if (!user)
				return res.status(404).send({ error: 'User not found' });
			res.status(200).send(user);
		} catch (error) {
			res.status(500).send({ error: 'Failed to fetch user' });
		}
	});

	app.delete('/:uuid', { preHandler: [authPreHandler] }, async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { uuid } = req.params as { uuid: string };
			if (req.user?.uuid !== uuid)
				return res.status(403).send({ error: 'Forbidden' });
			const deleteResult = deleteUser(uuid);
			if (!deleteResult)
				return res.status(500).send({ error: 'User not found' });
			res.status(204).send();
		} catch (error) {
			res.status(500).send({ error: 'Failed to delete user' });
		}
	});

	app.put('/update', { preHandler: [authPreHandler] }, async (req: FastifyRequest, res: FastifyReply) => {
		const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
		try {
			const uuid = req.user?.uuid;
			if (!uuid)
				return res.status(500).send({ error: 'No uuid in token' });
			const user = getUserStats(uuid);
			if (!user)
				return res.status(404).send({ error: 'User not found' });

			const parts = req.parts();
			let username: string | undefined;
			let password: string | undefined;
			let avatarPath: string | undefined;
			let deleteAvatar = false;

			for await (const part of parts)
			{
				if (part.fieldname === 'avatar')
				{
					if (part.type === 'file')
					{
						if (!ACCEPTED_TYPES.includes(part.mimetype))
							return res.status(400).send({ error: 'Invalid avatar file type.' });
						const uploadDir = path.join(process.cwd(), 'uploads');
						try {
							await fsAsync.mkdir(uploadDir, { recursive: true });
						} catch (err) {
							console.log('Could not create the upload directory');
						}
						const fileExtension = getExtensionFromMime(part.mimetype);
						const filePath = path.join(uploadDir, `${uuid}_${Date.now()}_avatar${fileExtension}`);
						const writeStream = fs.createWriteStream(filePath);
						await new Promise((resolve, reject) => {
							part.file.pipe(writeStream)
								.on('finish', () => resolve(undefined))
								.on('error', reject);
							});
						avatarPath = filePath;
						if (user.avatar)
						{
							try {
								await fsAsync.unlink(user.avatar);
							} catch (err) {
							console.log('Error deleting old avatar picture');
							}
						}
					}
					else
					{
						if (user.avatar)
						{
							deleteAvatar = true;
							try {
								await fsAsync.unlink(user.avatar);
							} catch (err) {
								console.log('Error deleting old avatar picture');
							}
						}
					}
				}
				else if (part.type === 'field')
				{
					if (part.fieldname === 'username' && part.value)
						username = part.value as string;
					else if (part.fieldname === 'password' && part.value)
						password = part.value as string;
				}
			}
			const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
			const updateResult = updateUser(uuid, username, avatarPath, passwordHash, deleteAvatar);
			if (!updateResult)
				return res.status(400).send({ error: 'No fields to update or update failed' });
			res.status(200).send({ success: true });
		} catch (error) {
			res.status(500).send({ error: 'Failed to update user' });
		}
	})
};

const getExtensionFromMime = (mimetype: string): string => {
	const mimeToExt: Record<string, string> = {
		'image/jpeg': '.jpeg',
		'image/jpg': '.jpg',
		'image/png': '.png',
	};
	return mimeToExt[mimetype] || '';
};
