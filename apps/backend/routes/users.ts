import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import {
  getUserStats,
  getUserByUuid,
  updateUsername,
  updatePassword,
  updateEmail,
  markEmailChange,
  confirmEmailChange,
  updateAvatar,
  getUserByUsername,
  getUserByEmail,
  getUserSettings,
  updateUserSettings,
} from '../db/queries/users.ts';
import {
  deleteUser,
  markUserForDelete,
  removeTokenFromDelete,
  findUserToDeleteAndClear,
} from '../db/queries/userDelete.ts';
import { authPreHandler, tokenUuidCheck } from '../hooks/auth.ts';
import { sendDeleteEmail, sendEmailChangeEmail } from '../utils/nodemailer/index.ts';
import { normalizeCredentials } from '../hooks/auth.ts';
import { updateLastSeenHandler } from '../hooks/updateLastSeen.ts';
import { UPLOAD_DIR } from '../utils/config.ts';
import {
  getAllUsersSchema,
  getUserSchema,
  getMeSchema,
  userDeleteSchema,
  userDeleteConfirmSchema,
  updateUsernameSchema,
  updateEmailSchema,
  emailConfirmSchema,
  updatePassSchema,
  updateAvatarSchema,
  deleteAvatarSchema,
  getSettingsSchema,
  updateSettingsSchema,
  twoFactorSetupSchema,
  twoFactorConfirmSchema,
  twoFactorDisableSchema,
} from '../schemas/userSchemas.ts';
import {
  getUserMatchesSchema,
  getMyStatsSchema,
  getUserStatsSchema,
} from '../schemas/matchSchemas.ts';
import {
  beginTwoFactorEnrollment,
  completeTwoFactorEnrollment,
  disableTwoFactor,
} from '../db/queries/twoFactor.ts';
import { generateAuthenticatorSecret, verifyTotpToken } from '../utils/twoFactor.ts';
import { getMatchesWithPlayersForUser } from '../db/queries/matches.ts';
import { getTotalStatsForUser } from '../db/queries/matchPlayerStats.ts';

export async function userRoutes(app: FastifyInstance) {
  // Get all users
  // app.get('/', { schema: getAllUsersSchema }, async (req: FastifyRequest, res: FastifyReply) => {
  //   try {
  //     const users = getUserStats();
  //     res.status(200).send(users);
  //   } catch (error) {
  //     res.status(500).send({ message: 'Failed to fetch users' });
  //   }
  // });

  // Get a single user by uuid or username
  app.get(
    '/:id',
    {
      schema: getUserSchema,
      preHandler: [authPreHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { id } = req.params as { id: string };
        const user = getUserStats(id);
        if (!user) return res.status(404).send({ message: 'User not found' });
        res.status(200).send(user);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch user' });
      }
    },
  );

  // Current user (for hydration)
  app.get(
    '/me',
    {
      schema: getMeSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler], // token -> req.user
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid; // set by authPreHandler
        const u = getUserByUuid(uuid);
        if (!u) return res.status(404).send({ message: 'User not found' });

        const stats = getUserStats(uuid);
        const wins = stats?.wins ?? 0;
        const losses = stats?.losses ?? 0;

        const { pass } = req.query as { pass?: string };
        const returnBody = {
          username: u.username,
          uuid: u.uuid,
          email: u.email,
          avatar: u.avatar ?? null,
          tfa: !!u.tfa,
          wins,
          losses,
          createdAt: u.createdAt ?? null,
          ...(pass && pass === 'yes' ? { hasPass: !!u.passwordHash } : {}),
        };
        // return only what the FE needs to render header/profile
        return res.status(200).send(returnBody);
      } catch (err) {
        return res.status(500).send({ message: 'Failed to fetch current user' });
      }
    },
  );

  app.get(
    '/me/stats',
    {
      schema: getMyStatsSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const user = getUserByUuid(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });
        const stats = getTotalStatsForUser(uuid);
        if (!stats) return res.status(500).send({ message: 'Failed to fetch user stats' });
        return res.status(200).send(stats);
      } catch (err) {
        return res.status(500).send({ message: 'Failed to fetch user stats' });
      }
    },
  );

  app.get(
    '/:uuid/stats',
    {
      schema: getUserStatsSchema,
      preHandler: [authPreHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { uuid } = req.params as { uuid: string };
        const user = getUserByUuid(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });
        const stats = getTotalStatsForUser(uuid);
        if (!stats) return res.status(500).send({ message: 'Failed to fetch user stats' });
        return res.status(200).send(stats);
      } catch (err) {
        return res.status(500).send({ message: 'Failed to fetch user stats' });
      }
    },
  );

  // Sends a email confirmation for user deletion
  app.delete(
    '/me',
    {
      schema: userDeleteSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const user = getUserByUuid(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });
        const confirmationToken = crypto.randomBytes(32).toString('hex');
        const result = markUserForDelete(user.uuid, confirmationToken);
        if (!result) return res.status(500).send({ message: 'Failed to mark user for deletion.' });
        const emailSent = await sendDeleteEmail(user.email, confirmationToken);
        if (!emailSent) {
          removeTokenFromDelete(confirmationToken);
          return res.status(500).send({ message: 'Failed to send confirmation email.' });
        }
        res.status(200).send({ success: 'Confirmation link sent to email.' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to process user delete request' });
      }
    },
  );

  // Delete user with a valid delete token
  app.post(
    '/me/confirm-delete/:token',
    {
      schema: userDeleteConfirmSchema,
      preHandler: [authPreHandler, tokenUuidCheck],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { token } = req.params as { token: string };
        const uuid = req.user!.uuid;
        const uuidForDelete = findUserToDeleteAndClear(token);
        if (!uuidForDelete || uuidForDelete !== uuid)
          return res.status(400).send({ message: 'Invalid or expired token.' });
        const deleteResult = deleteUser(uuidForDelete);
        if (!deleteResult) return res.status(500).send({ message: 'Failed to delete user' });
        res.status(204).send();
      } catch (error) {
        res.status(500).send({ message: 'Failed to delete user' });
      }
    },
  );

  // Update username, requires token and { newUsername } as request body
  app.patch(
    '/me',
    {
      preValidation: [normalizeCredentials],
      schema: updateUsernameSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { newUsername } = req.body as { newUsername: string };
        const uuid = req.user!.uuid;

        const user = getUserStats(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });

        const newUser = getUserByUsername(newUsername);
        if (newUser && newUser.uuid !== uuid)
          return res.status(400).send({ message: 'Username already in use' });

        const updateResult = updateUsername(uuid, newUsername);
        if (!updateResult) return res.status(400).send({ message: 'Update failed' });
        user.username = newUsername;
        res.status(200).send(user);
      } catch (error) {
        res.status(500).send({ message: 'Failed to update user' });
      }
    },
  );

  // Update password, requires token and { newPassword, currentPassword } as request body
  app.patch(
    '/me/password',
    {
      preValidation: [normalizeCredentials],
      schema: updatePassSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { newPassword, currentPassword } = req.body as {
          newPassword: string;
          currentPassword?: string;
        };
        const uuid = req.user!.uuid;
        const user = getUserByUuid(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });
        if (user.passwordHash) {
          if (!currentPassword) return res.status(400).send({ message: 'Invalid password' });
          const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash || '');
          if (!isValidPassword) return res.status(400).send({ message: 'Invalid password' });
        }
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        const updateResult = updatePassword(uuid, newPasswordHash);
        if (!updateResult) return res.status(400).send({ message: 'Update failed' });
        res.status(200).send({ success: 'Password successfully updated' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to update user' });
      }
    },
  );

  // Request email update, sends confirmation to new email
  app.patch(
    '/me/email',
    {
      schema: updateEmailSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { newEmail } = req.body as { newEmail: string };
        const uuid = req.user!.uuid;
        const user = getUserByUuid(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });

        // Check if email is already in use
        const existingUser = getUserByEmail(newEmail);
        if (existingUser && existingUser.uuid !== uuid)
          return res.status(400).send({ message: 'Email already in use' });

        // Generate token and mark email change
        const token = crypto.randomBytes(32).toString('hex');
        const markResult = markEmailChange(uuid, newEmail, token);
        if (!markResult)
          return res.status(400).send({ message: 'Failed to initiate email change' });

        // Send confirmation email to new email address
        const emailSent = await sendEmailChangeEmail(newEmail, token);
        if (!emailSent)
          return res.status(500).send({ message: 'Failed to send confirmation email' });

        res.status(200).send({ success: 'Confirmation email sent to new email address' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to request email update' });
      }
    },
  );

  // Confirm email change
  app.post(
    '/confirm-email/:token',
    {
      schema: emailConfirmSchema,
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { token } = req.params as { token: string };

        const confirmResult = confirmEmailChange(token);
        if (!confirmResult) return res.status(400).send({ message: 'Invalid or expired token' });

        res.status(200).send({ success: 'Email successfully updated' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to confirm email change' });
      }
    },
  );

  // Start two-factor setup
  app.post(
    '/me/tfa/setup',
    {
      schema: twoFactorSetupSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const user = getUserByUuid(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });
        if (user.tfa && user.tfaSecret)
          return res.status(400).send({ message: 'Two-factor authentication already enabled' });

        const { secret, otpauthUrl } = generateAuthenticatorSecret({
          label: user.email || user.username,
        });
        const saved = beginTwoFactorEnrollment(uuid, secret);
        if (!saved) return res.status(500).send({ message: 'Failed to start setup' });

        res.status(200).send({ secret, otpauthUrl });
      } catch (error) {
        res.status(500).send({ message: 'Failed to start two-factor setup' });
      }
    },
  );

  // Confirm two-factor setup
  app.post(
    '/me/tfa/confirm',
    {
      schema: twoFactorConfirmSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const { code } = req.body as { code: string };
        const user = getUserByUuid(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });
        if (!user.tfaSecret)
          return res.status(400).send({ message: 'No pending two-factor setup found' });

        const valid = verifyTotpToken(user.tfaSecret, code);
        if (!valid) return res.status(400).send({ message: 'Invalid authentication code' });

        const completed = completeTwoFactorEnrollment(uuid, user.tfaSecret);
        if (!completed) return res.status(500).send({ message: 'Failed to enable two-factor' });

        res.status(200).send({ success: 'Two-factor authentication enabled.' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to confirm two-factor setup' });
      }
    },
  );

  // Disable two-factor
  app.delete(
    '/me/tfa',
    {
      schema: twoFactorDisableSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const user = getUserByUuid(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });
        if (!user.tfa && !user.tfaSecret) {
          res.status(200).send({ success: 'Two-factor authentication disabled.' });
          return;
        }
        const disabled = disableTwoFactor(uuid);
        if (!disabled) return res.status(500).send({ message: 'Failed to disable two-factor' });
        res.status(200).send({ success: 'Two-factor authentication disabled.' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to disable two-factor' });
      }
    },
  );

  // Change avatar picture, requires token and multipart form with { avatar } file
  app.patch(
    '/me/avatar',
    {
      schema: updateAvatarSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;

        const user = getUserStats(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });

        const file = await req.file();
        if (!file) return res.status(400).send({ message: 'No file in request' });
        if (file.fieldname !== 'avatar')
          return res.status(400).send({ message: 'Invalid fieldname' });

        const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
        if (!ACCEPTED_TYPES.includes(file.mimetype))
          return res.status(400).send({ message: 'Invalid avatar file type.' });

        const fileExtension = getExtensionFromMime(file.mimetype);
        const fileName = `${uuid}_${Date.now()}_avatar${fileExtension}`;
        const filePath = path.join(UPLOAD_DIR, fileName);
        const writeStream = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
          file.file
            .pipe(writeStream)
            .on('finish', () => resolve(undefined))
            .on('error', reject);
        });

        // Delete old avatar (if exists)
        if (user.avatar) {
          try {
            await fsAsync.unlink(path.join(UPLOAD_DIR, user.avatar));
          } catch (err) {
            app.log.info('Error deleting old avatar picture');
          }
        }
        const updateResult = updateAvatar(uuid, fileName);
        if (!updateResult) return res.status(400).send({ message: 'Update failed' });
        user.avatar = fileName;
        res.status(200).send(user);
      } catch (error) {
        res.status(500).send({ message: 'Failed to update user' });
      }
    },
  );

  // Delete avatar picture, requires token
  app.delete(
    '/me/avatar',
    {
      schema: deleteAvatarSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;

        const user = getUserStats(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });
        if (!user.avatar) return res.status(400).send({ message: 'No avatar to delete' });

        try {
          await fsAsync.unlink(user.avatar);
        } catch (err) {
          app.log.info('Error deleting old avatar picture');
        }

        const updateResult = updateAvatar(uuid);
        if (!updateResult) return res.status(400).send({ message: 'Avatar delete failed' });
        user.avatar = null;
        res.status(200).send(user);
      } catch (error) {
        res.status(500).send({ message: 'Failed to delete avatar' });
      }
    },
  );

  app.get(
    '/me/settings',
    {
      schema: getSettingsSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const settings = getUserSettings(uuid);
        if (!settings) return res.status(404).send({ message: 'Failed to fetch user settings' });
        res.status(200).send(settings);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch user profile settings' });
      }
    },
  );

  app.patch(
    '/me/settings',
    {
      schema: updateSettingsSchema,
      preHandler: [authPreHandler, tokenUuidCheck, updateLastSeenHandler],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const { paddleColor, colorBlindMode, photoSensitiveMode } = req.body as {
          paddleColor?: string;
          colorBlindMode?: number;
          photoSensitiveMode?: number;
        };
        const updateFields: Record<string, unknown> = {};
        if (paddleColor !== undefined) updateFields.paddle_color = paddleColor;
        if (colorBlindMode !== undefined) updateFields.color_blind_mode = colorBlindMode;
        if (photoSensitiveMode !== undefined)
          updateFields.photo_sensitive_mode = photoSensitiveMode;
        const success = updateUserSettings(uuid, updateFields);
        if (!success) return res.status(400).send({ message: 'Failed to update settings.' });
        const settings = getUserSettings(uuid);
        res.status(200).send(settings);
      } catch (err) {
        res.status(500).send({ message: 'Failed to update user profile settings.' });
      }
    },
  );

  app.get(
    '/:uuid/matches',
    {
      schema: getUserMatchesSchema,
      preHandler: [authPreHandler, tokenUuidCheck],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { uuid } = req.params as { uuid: string };
        const { count, offset } = req.query as { count?: number; offset?: number };
        const user = getUserByUuid(uuid);
        if (!user) return res.status(404).send({ message: 'User not found' });
        const results = getMatchesWithPlayersForUser(uuid, count, offset);
        return res.status(200).send(results);
      } catch (error) {
        app.log.error({ error }, 'GET /matches failed:');
        return res.status(500).send({ message: 'Failed to fetch match data for user' });
      }
    },
  );
}

const getExtensionFromMime = (mimetype: string): string => {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpeg',
    'image/jpg': '.jpg',
    'image/png': '.png',
  };
  return mimeToExt[mimetype] || '';
};
