import type { JoinTokenClaims } from '@pong/shared/protocol/net';
import { verifyJoinToken as decodeJoinToken } from '@pong/shared/auth/tokenSign';

/**
 * AuthService encapsulates validation of join tokens for the game server.
 *
 * It builds on top of the shared verifyJoinToken helper (which only checks
 * signature + expiry) and adds game‑server‑specific invariants:
 *   - token must target this roomIdentifier
 *   - token must be issued by matchmaking ('mm') for a game node ('game-node')
 */
export class AuthService {
  verifyJoinToken(token: string, roomIdentifier: string): JoinTokenClaims {
    // First, validate HMAC + expiry and decode the claims.
    const claims = decodeJoinToken(token);
    if (!claims) throw new Error('invalid-token');

    // Ensure the token was minted for the room we’re handling.
    if (claims.roomIdentifier !== roomIdentifier) throw new Error('room-mismatch');

    // Enforce issuer/audience contract for allocator → game-node join tokens.
    if (claims.aud !== 'game-node' || claims.iss !== 'mm') {
      throw new Error('invalid-issuer');
    }

    return claims;
  }
}
