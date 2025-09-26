import crypto from 'crypto';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt.ts';
import { hashRefreshToken, storeRefreshToken } from '../db/queries/refreshTokens.ts';

type UserIdentity = {
  uuid: string;
  username: string;
};

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  refreshCookieMaxAge: number;
};

export function issueTokensForUser(user: UserIdentity): IssuedTokens {
  const accessToken = signAccessToken(user);

  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ ...user, tokenId });

  const refreshPayload = verifyRefreshToken(refreshToken, { ignoreExpiration: true });
  if (!refreshPayload.exp) throw new Error('Refresh token missing expiration');

  const hashedToken = hashRefreshToken(refreshToken);
  const expiresAtIso = new Date(refreshPayload.exp * 1000).toISOString();

  const stored = storeRefreshToken({
    tokenId,
    userUuid: user.uuid,
    hashedToken,
    expiresAt: expiresAtIso,
  });

  if (!stored) throw new Error('Failed to persist refresh token');

  const secondsUntilExpiry = Math.max(
    1,
    Math.floor(refreshPayload.exp - Date.now() / 1000),
  );

  return {
    accessToken,
    refreshToken,
    refreshCookieMaxAge: secondsUntilExpiry,
  };
}
