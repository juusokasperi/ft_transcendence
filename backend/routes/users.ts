import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getUserStats, getUserByUuid, updateUsername, updatePassword, updateAvatar, getUserByUsername } from '../db/queries/users.ts';
import { deleteUser, markUserForDelete, removeTokenFromDelete, findUserToDeleteAndClear } from '../db/queries/userDelete.ts';
import { authPreHandler, tokenUuidCheck } from '../hooks/auth.ts';
import { sendDeleteEmail } from '../utils/nodemailer/index.ts';
import { normalizeCredentials } from '../hooks/auth.ts';
import { updateLastSeenHandler } from '../hooks/updateLastSeen.ts';
import { UPLOAD_DIR } from '../utils/config.ts';

/*
	TO DO:

	// Add routes for 2 Factor Auth? Which will also require some additional
	// fields to User table in database. At least one for the secret, maybe one for backup codes?

*/

export async function userRoutes(app: FastifyInstance) {
	// Get all users
	app.get('/', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const users = getUserStats();
			res.status(200).send(users);
		} catch (error) {
			res.status(500).send({ message: 'Failed to fetch users' });
		}
	});

	// Get a single user
	app.get('/:uuid', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { uuid } = req.params as { uuid: string };
			const user = getUserStats(uuid);
			if (!user)
				return res.status(404).send({ message: 'User not found' });
			res.status(200).send(user);
		} catch (error) {
			res.status(500).send({ message: 'Failed to fetch user' });
		}
	});

	// Sends a email confirmation for user deletion
	app.delete('/me',
		{ preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler] },
		async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const uuid = req.user!.uuid;
			const user = getUserByUuid(uuid);
			if (!user)
				return res.status(404).send({ message: 'User not found' });
			const confirmationToken = crypto.randomBytes(32).toString('hex');
			const result = markUserForDelete(user.uuid,  confirmationToken);
			if (!result)
				return res.status(500).send({ message: 'Failed to mark user for deletion.' });
			const emailSent = await sendDeleteEmail(user.email, confirmationToken);
			if (!emailSent) {
				removeTokenFromDelete(confirmationToken);
				return res.status(500).send({ message: 'Failed to send confirmation email.' });
			}
			res.status(200).send({ success: 'Confirmation link sent to email.' });
		} catch (error) {
			res.status(500).send({ message: 'Failed to process user delete request' });
		}
	});

	// Delete user with a valid delete token
	app.post('/me/confirm-delete/:token',
		{ preHandler: [authPreHandler, tokenUuidCheck] },
		async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { token } = req.params as { token: string };
			const uuid = req.user!.uuid;
			const uuidForDelete = findUserToDeleteAndClear(token);
			if (!uuidForDelete || uuidForDelete !== uuid)
				return res.status(400).send({ message: 'Invalid or expired token.' });
			const deleteResult = deleteUser(uuidForDelete);
			if (!deleteResult)
				return res.status(500).send({ message: 'Failed to delete user' });
			res.status(204).send();
		} catch (error) {
			res.status(500).send({ message: 'Failed to delete user' });
		}
	});

	// Update username, requires token and { newUsername } as request body
	// Add validation for username
	app.patch('/me',
		{ preValidation: [normalizeCredentials],
		preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler] },
		async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { newUsername } = req.body as { newUsername: string; };
			const uuid = req.user!.uuid;

			const user = getUserStats(uuid);
			if (!user)
				return res.status(404).send({ message: 'User not found' });

			const newUser = getUserByUsername(newUsername);
			if (newUser && newUser.uuid !== uuid)
				return res.status(400).send({ message: 'Username already in use' });

			const updateResult = updateUsername(uuid, newUsername);
			if (!updateResult)
				return res.status(400).send({ message: 'Update failed' });
			user.username = newUsername;
			res.status(200).send(user);
		} catch (error) {
			res.status(500).send({ message: 'Failed to update user' });
		}
	});

	// Update password, requires token and { newPassword, currentPassword } as request body
	app.patch('/me/password',
		{ preValidation: [normalizeCredentials],
		preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler] },
		async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { newPassword, currentPassword } = req.body as { newPassword: string; currentPassword: string; };
			const uuid = req.user!.uuid;
			const user = getUserByUuid(uuid);
			if (!user)
				return res.status(404).send({ message: 'User not found' });

			const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash || '');
			if (!isValidPassword)
				return (res.status(400).send({ message: 'Invalid password' }));

			const newPasswordHash = await bcrypt.hash(newPassword, 10);
			const updateResult = updatePassword(uuid, newPasswordHash);
			if (!updateResult)
				return res.status(400).send({ message: 'Update failed' });
			res.status(200).send();
		} catch (error) {
			res.status(500).send({ message: 'Failed to update user' });
		}
	});

	// Change avatar picture, requires token and multipart form with { avatar } file
	app.patch('/me/avatar',
		{ preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler] },
		async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const uuid = req.user!.uuid;

			const user = getUserStats(uuid);
			if (!user)
				return res.status(404).send({ message: 'User not found' });

			const file = await req.file();
			if (!file)
				return res.status(400).send({ message: 'No file in request' });
			if (file.fieldname !== 'avatar')
				return res.status(400).send({ message: 'Invalid fieldname' });

			const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
			if (!ACCEPTED_TYPES.includes(file.mimetype))
				return res.status(400).send({ message: 'Invalid avatar file type.' });

			const uploadDir = path.join(process.cwd(), UPLOAD_DIR);

			const fileExtension = getExtensionFromMime(file.mimetype);
			const fileName = `${uuid}_${Date.now()}_avatar${fileExtension}`;
			const filePath = path.join(uploadDir, fileName);
			const writeStream = fs.createWriteStream(filePath);
			await new Promise((resolve, reject) => {
				file.file.pipe(writeStream)
					.on('finish', () => resolve(undefined))
					.on('error', reject);
				});

			// Delete old avatar (if exists)
			if (user.avatar)
			{
				try {
					await fsAsync.unlink(path.join(uploadDir, user.avatar));
				} catch (err) {
					console.log('Error deleting old avatar picture');
				}
			}
			const updateResult = updateAvatar(uuid, fileName);
			if (!updateResult)
				return res.status(400).send({ message: 'Update failed' });
			user.avatar = fileName;
			res.status(200).send(user);
		} catch (error) {
			res.status(500).send({ message: 'Failed to update user' });
		}
	});

	// Delete avatar picture, requires token
	app.delete('/me/avatar',
		{ preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler] },
		async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const uuid = req.user!.uuid;

			const user = getUserStats(uuid);
			if (!user)
				return res.status(404).send({ message: 'User not found' });
			if (!user.avatar)
				return res.status(400).send({ message: 'No avatar to delete' });

			try {
				await fsAsync.unlink(user.avatar);
			} catch (err) {
				console.log('Error deleting old avatar picture');
			}

			const updateResult = updateAvatar(uuid);
			if (!updateResult)
				return res.status(400).send({ message: 'Avatar delete failed' });
			user.avatar = null;
			res.status(200).send(user);
		} catch (error) {
			res.status(500).send({ message: 'Failed to delete avatar' });
		}
	});
};

const getExtensionFromMime = (mimetype: string): string => {
	const mimeToExt: Record<string, string> = {
		'image/jpeg': '.jpeg',
		'image/jpg': '.jpg',
		'image/png': '.png',
	};
	return mimeToExt[mimetype] || '';
};
