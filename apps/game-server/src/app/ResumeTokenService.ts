import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from '@utils/logger';
import type { ResumeTokenClaims } from '@pong/shared/protocol/net';
import { signResumeToken, verifyResumeToken } from '@pong/shared/auth/tokenSign';
import { v4 as uuid } from 'uuid';

/**
 * Runtime parameters for issuing a new resume token.
 *
 * These values are provided by the game server when a player connects and are
 * embedded into the token claims.
 */
type IssueParams = {
  /** Room identifier the player may resume into. */
  roomIdentifier: string;
  /** Player identifier (user UUID) this token belongs to. */
  playerIdentifier: string;
  /** Session identifier for the MatchSession; used to detect stale tokens. */
  sessionIdentifier: string;
  /** Desired time‑to‑live for the token in milliseconds. */
  ttlMs: number;
};

/**
 * ResumeTokenService handles issuing and consuming **single‑use resume tokens**
 * for reconnecting to game sessions.
 *
 * Tokens are:
 *   - signed with the realtime secret via signResumeToken
 *   - scoped to a room + player + sessionIdentifier
 *   - persisted in Redis as `resume-token:<jti>` with TTL and NX to enforce single‑use
 *
 * WSServer uses this service to:
 *   - rotate fresh tokens while a player is connected
 *   - validate and consume tokens presented via the `resume` WebSocket subprotocol
 */
export class ResumeTokenService {
  private readonly redis: Redis;
  private readonly logger: FastifyBaseLogger;

  constructor(args: { redis: Redis; logger: FastifyBaseLogger }) {
    this.redis = args.redis;
    this.logger = args.logger;
  }

  /**
   * Issue a new single‑use resume token for a given player/session.
   *
   * Steps:
   *   - build ResumeTokenClaims with iss/aud 'game-server' and the requested TTL
   *   - sign the token using signResumeToken
   *   - persist `resume-token:<jti>` in Redis with EX ttlSeconds and NX (fail if already set)
   *
   * On success, returns both the string token and its claims.
   * On failure to persist, throws so callers can treat it as a fatal error for this connection.
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
      // Do not leak a token that cannot be used; force caller to handle this as an error.
      this.logger.warn(
        { jti: claims.jti },
        '[ResumeTokenService] Failed to persist resume token in Redis (NX not set)',
      );
      throw new Error('resume-token-persist');
    }
    return { resumeToken, claims };
  }

  /**
   * Verify and consume a resume token.
   *
   * Steps:
   *   - validate signature/expiry via verifyResumeToken
   *   - enforce iss/aud === 'game-server'
   *   - delete `resume-token:<jti>` from Redis (must delete exactly 1 to be valid)
   *
   * Returns:
   *   - claims when the token is valid, scoped correctly, and not replayed
   *   - null when the token is invalid, expired, has wrong iss/aud, or has already been used
   */
  async consume(token: string): Promise<ResumeTokenClaims | null> {
    const claims = verifyResumeToken(token);
    if (!claims) return null;
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
      // If we did not delete exactly one key, treat this as a replay or mismatch.
      this.logger.warn({ jti: claims.jti }, 'Replay detected');
      return null;
    }
    return claims;
  }
}
