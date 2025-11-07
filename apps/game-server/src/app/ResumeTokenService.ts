import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from '@utils/logger';
import type { ResumeTokenClaims } from '@pong/shared/protocol/net';
import { signResumeToken, verifyResumeToken } from '@pong/shared/auth/tokenSign';
import { v4 as uuid } from 'uuid';

type IssueParams = {
  roomIdentifier: string;
  playerIdentifier: string;
  sessionIdentifier: string;
  ttlMs: number;
};

export class ResumeTokenService {
  private readonly redis: Redis;
  private readonly logger: FastifyBaseLogger;

  constructor(args: { redis: Redis; logger: FastifyBaseLogger }) {
    this.redis = args.redis;
    this.logger = args.logger;
  }

  async issue(params: IssueParams) {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = Math.max(1, Math.ceil(params.ttlMs / 1000));
    const claims: ResumeTokenClaims = {
      iss: 'game-server',
      aud: 'game-server',
      iat: now,
      exp: now + ttlSeconds,
      jti: uuid(),
      roomIdentifier: params.roomIdentifier,
      sub: params.playerIdentifier,
      sessionIdentifier: params.sessionIdentifier,
    };
    const resumeToken = signResumeToken(claims);
    const key = `resume-token:${claims.jti}`;
    const setResult = await this.redis.set(
      key,
      JSON.stringify({ roomIdentifier: claims.roomIdentifier }),
      'EX',
      ttlSeconds,
      'NX',
    );
    if (setResult !== 'OK')
      this.logger.warn(
        { jti: claims.jti },
        '[ResumeTokenService]: Failed to persist resume token in Redis',
      );
    const payload = { resumeToken, claims };
    return { resumeToken, claims };
  }

  async consume(token: string) {
    const claims = verifyResumeToken(token);
    if (!claims) return null;

    const key = `resume-token:${claims.jti}`;
    const consumed = await this.redis.del(key);
    if (consumed !== 1) {
      this.logger.warn({ jti: claims.jti }, 'Replay detected');
      return null;
    }
    return claims;
  }
}
