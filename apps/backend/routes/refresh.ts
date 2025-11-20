import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  getRefreshToken,
  deleteRefreshToken,
  hashRefreshToken,
} from '../db/queries/refreshTokens.ts';
import { verifyRefreshToken } from '../utils/jwt.ts';
import { issueTokensForUser } from '../utils/authTokens.ts';
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from '../utils/config.ts';
import { getUserByUuid } from '../db/queries/users.ts';

const ACCESS_COOKIE = ACCESS_TOKEN_COOKIE_NAME;
const REFRESH_COOKIE = REFRESH_TOKEN_COOKIE_NAME;
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}

export async function refreshRoutes(app: FastifyInstance) {
  app.post('/refresh', async (req, reply) => {
    const refreshCookie = req.cookies[REFRESH_COOKIE];
    if (!refreshCookie) {
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'refresh_missing' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshCookie, { ignoreExpiration: true });
    } catch {
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'refresh_invalid' });
    }

    const stored = getRefreshToken(payload.tokenId);
    if (!stored || stored.user_uuid !== payload.uuid) {
      if (stored) deleteRefreshToken(payload.tokenId);
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'refresh_not_found' });
    }

    const hashed = hashRefreshToken(refreshCookie);
    if (hashed !== stored.hashed_token) {
      deleteRefreshToken(payload.tokenId);
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'refresh_mismatch' });
    }

    const expiresAtMs = Date.parse(stored.expires_at);
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
      deleteRefreshToken(payload.tokenId);
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'refresh_expired' });
    }

    const user = getUserByUuid(payload.uuid);
    if (!user) {
      deleteRefreshToken(payload.tokenId);
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'refresh_user_not_found' });
    }

    let issued;
    try {
      issued = issueTokensForUser({ uuid: user.uuid, username: user.username });
    } catch {
      clearAuthCookies(reply);
      return reply.status(500).send({ error: 'refresh_failed' });
    }

    deleteRefreshToken(payload.tokenId);

    reply.setCookie(ACCESS_COOKIE, issued.accessToken, {
      ...COOKIE_BASE,
      maxAge: 60 * 60 * 4,
    });

    reply.setCookie(REFRESH_COOKIE, issued.refreshToken, {
      ...COOKIE_BASE,
      maxAge: issued.refreshCookieMaxAge,
    });

    return reply.status(200).send({ success: true });
  });
}
