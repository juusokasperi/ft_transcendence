import crypto from 'crypto';
import type { JoinTokenClaims, ResumeTokenClaims } from '../protocol/net';

/**
 * Shared signing/verification helpers for realtime tokens used by Pong:
 *
 * - Join tokens: allocator/matchmaking → gateway/game-server (room admission).
 * - Resume tokens: game-server → client → gateway/game-server (reconnect).
 *
 * All tokens are compact, JWT‑like triples: header.payload.signature, with:
 *   - header: `{ alg: 'HS256', typ: 'JWT' }` (base64url)
 *   - payload: JSON claims (base64url)
 *   - signature: HMAC‑SHA256 over "header.payload" with REALTIME_TOKEN_SECRET.
 */
const SECRET = process.env.REALTIME_TOKEN_SECRET || 'dev-change-me';

/**
 * Sign a JoinTokenClaims payload into a compact HMAC "JWT" string.
 *
 * Used by the allocator to mint join tokens that gateway and game server can
 * verify with verifyJoinToken.
 */
export function signJoinToken(claims: JoinTokenClaims): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Validates a join token using HMAC and expiry, and returns the decoded claims when valid.
 *
 * This does **not** check issuer/audience/room; callers must enforce those semantics
 * separately based on their context.
 *
 * Currently used by:
 *   - The game gateway (`apps/game-gateway/index.ts`) to admit WS upgrades on `/g/:roomId`.
 *   - The game server AuthService (`apps/game-server/src/app/AuthService.ts`) before attaching players.
 */
export function verifyJoinToken(token: string): JoinTokenClaims | null {
  // Basic structure: header.payload.signature (all base64url).
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;

  // Recompute expected HMAC over "header.payload" with the shared secret.
  const data = `${header}.${payload}`;
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;

  try {
    // Decode and parse the JSON payload into JoinTokenClaims.
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    // Enforce a numeric exp and ensure the token is not expired.
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    // Any parse or decoding error is treated as an invalid token.
    return null;
  }
}

/**
 * Sign a ResumeTokenClaims payload into a compact HMAC "JWT" string.
 *
 * Used by game servers (via ResumeTokenService) to mint resume tokens that
 * allow clients to reconnect to an existing MatchSession.
 */
export function signResumeToken(claims: ResumeTokenClaims): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Validate a resume token using HMAC and expiry, and return decoded claims when valid.
 *
 * This does **not** check issuer/audience/room; callers (gateway, ResumeTokenService)
 * must enforce iss/aud/room semantics based on their context.
 */
export function verifyResumeToken(token: string): ResumeTokenClaims | null {
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;
  const data = `${header}.${payload}`;
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    // Decode and parse the JSON payload into ResumeTokenClaims.
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    // Enforce numeric exp and ensure token has not expired.
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    // Any parse or decoding error is treated as an invalid token.
    return null;
  }
}
