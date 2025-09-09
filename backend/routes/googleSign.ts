import type { FastifyInstance } from 'fastify';
import type { FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db/client.ts';
import {
  getUserByGoogleId,
  createUserFromGoogle,
  getUserByEmail,
  getUser,
  updateLastSeen,
} from '../db/queries/users.ts';

// Google OAuth2 endpoints
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

const SESSION_COOKIE = 'session';
const STATE_COOKIE = 'oauth_state';

const redirectPath = process.env.GOOGLE_OAUTH_REDIRECT_PATH || '/api/auth/google/callback';

function buildRedirectUri(req: FastifyRequest) {
  const envBase = process.env.BASE_URL;
  if (envBase && /^https?:\/\//i.test(envBase)) {
    return new URL(redirectPath, envBase).toString();
  }
  const host  = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string);
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  return `${proto}://${host}${redirectPath.startsWith('/') ? '' : '/'}${redirectPath}`;
}

function randomState() {
  return crypto.randomBytes(24).toString('base64url');
}

function issueAppJWT(uuid: string) {
  return jwt.sign({ uuid }, process.env.SECRET!, {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
}

export default async function googleSign(app: FastifyInstance) {
  // 1) Старт Google OAuth
  app.get('/api/auth/google', async (req, reply) => {
    const state = randomState();

    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60, // 10 минут
    });

    const redirectUri = buildRedirectUri(req);
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent'); // чтобы стабильно получать refresh_token (на будущее)

    return reply.redirect(url.toString());
  });

  // 2) Callback от Google
  app.get('/api/auth/google/callback', async (req, reply) => {
    const { code, state } = (req.query as { code?: string; state?: string }) || {};
    const stateCookie = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: '/' });

    if (!code || !state || state !== stateCookie) {
      return reply.status(400).send({ error: 'invalid_state' });
    }

    // Обмен кода на токены
    const redirectUri = buildRedirectUri(req);
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return reply.status(502).send({ error: 'token_exchange_failed', detail: text });
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      id_token: string;
      expires_in: number;
      refresh_token?: string;
      scope?: string;
      token_type?: string;
    };

    // Профиль (OIDC userinfo)
    const profileRes = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) {
      return reply.status(502).send({ error: 'userinfo_failed' });
    }

    const profile = (await profileRes.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    if (!profile.sub) {
      return reply.status(400).send({ error: 'no_sub' });
    }

    // Upsert пользователя
    let user = getUserByGoogleId(profile.sub);

    // 2.1 Если нет — пытаемся создать
    if (!user) {
      // ⚠️ У тебя UNIQUE(email). Если уже есть локальный пользователь с такой почтой,
      // вставка упадёт. Обработаем линковку:
      let created = createUserFromGoogle({
        googleId: profile.sub,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      });

      if (!created && profile.email) {
        // Вероятно, email занят. Найдём пользователя по email и привяжем google_id,
        // если ещё не привязан.
        const existingByEmail = getUserByEmail(profile.email);
        if (existingByEmail && !existingByEmail.googleId) {
          db.prepare(`UPDATE Users SET google_id = ? WHERE uuid = ? AND google_id IS NULL`).run(
            profile.sub,
            existingByEmail.uuid,
          );

          user = getUser(existingByEmail.uuid);
        }
      } else {
        user = created;
      }

      if (!user) {
        // Если сюда дошли — значит email занят, и привязать не удалось
        return reply.status(409).send({
          error: 'email_taken',
          message: 'Email already in use. Please sign in locally, then link Google in settings.',
        });
      }
    }

    // 2.2 Обновим last_seen (по желанию)
    try {
      updateLastSeen(user.uuid, new Date());
    } catch {
      // не критично
    }

    // 3) Выдаём JWT в HttpOnly cookie
    const token = issueAppJWT(user.uuid);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 дней
    });

    // Готово — возвращаемся на SPA
    return reply.redirect('/');
  });
}
