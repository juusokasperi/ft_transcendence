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

  /**
   * Issues a single-use resume token and persists its jti with TTL.
   * Fails closed (throws) if Redis persistence does not succeed.
   */
  async issue(params: IssueParams): Promise<{ resumeToken: string; claims: ResumeTokenClaims }> {
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
    if (setResult !== 'OK') {
      // Do not leak an unusable token to clients; let caller decide how to handle.
      this.logger.warn(
        { jti: claims.jti },
        '[ResumeTokenService] Failed to persist resume token in Redis (NX not set)',
      );
      throw new Error('resume-token-persist');
    }
    return { resumeToken, claims };
  }

  /**
   * Verifies and consumes a resume token (single-use).
   * Returns claims when valid; otherwise returns null.
   */
  async consume(token: string): Promise<ResumeTokenClaims | null> {
    const claims = verifyResumeToken(token);
    if (!claims) return null;
    // Defense in depth: validate expected issuer/audience even if signing verified.
    if (claims.iss !== 'game-server' || claims.aud !== 'game-server') {
      this.logger.warn(
        { jti: claims.jti, iss: claims.iss, aud: claims.aud },
        '[ResumeTokenService] Invalid iss/aud for resume token',
      );
      return null;
    }

    const key = `resume-token:${claims.jti}`;
    const consumed = await this.redis.del(key);
    if (consumed !== 1) {
      this.logger.warn({ jti: claims.jti }, 'Replay detected');
      return null;
    }
    return claims;
  }
}
