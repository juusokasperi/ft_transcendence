import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserByEmail, updatePassword } from '../db/queries/users.ts';
import { clearResetTokensForId, createResetToken, clearExpiredTokens, findAndClearResetToken } from '../db/queries/passwordResets.ts';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sendResetPasswordEmail } from '../utils/nodemailer/index.ts';

// Add a preValidation hook using 'zod' for username/password validness. TODO
export async function resetPasswordRoutes(app: FastifyInstance) {
	// Request a password reset email
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { email } = req.body as { email: string };
			if (!email)
				return res.status(400).send({ message: 'Email is required' });
			const user = getUserByEmail(email);

			if (user)
			{
				const resetToken = crypto.randomBytes(32).toString('hex');
				clearResetTokensForId(user.uuid);
				const resetResult = createResetToken(user.uuid, resetToken);
				if (resetResult)
				{
					const emailSent = await sendResetPasswordEmail(email, resetToken);
					if (!emailSent)
						clearResetTokensForId(user.uuid);
				}
				else
					clearResetTokensForId(user.uuid);
			}

			// Send status 200 no matter what, so malicious user cannot try to find out
			// existing emails in database
			res.status(200).send({ success: 'Password reset link sent to email if exists.' });
		} catch (error) {
			res.status(500).send({ message: 'Failed to process password reset request.' });
		}
	});

	app.post('/:resetToken', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { resetToken } = req.params as { resetToken: string };
			const { newPassword } = req.body as { newPassword: string };
			if (!newPassword)
				return res.status(400).send({ message: 'New password is required.'});

			// REMOVE THIS and add a interval based cleanup?
			clearExpiredTokens();

			const uuid = findAndClearResetToken(resetToken);
			if (!uuid)
				return res.status(400).send({ message: 'Invalid or expired token.' });
			const passwordHash = await bcrypt.hash(newPassword, 10);
			const result = updatePassword(uuid, passwordHash);
			if (!result)
				return res.status(500).send({ message: 'Failed to update password.' });
			return res.status(200).send({ message: 'Password succesfully updated.' });
		} catch (error) {
			res.status(500).send({ message: 'Failed to process password reset request.' });
		}
	});
};
