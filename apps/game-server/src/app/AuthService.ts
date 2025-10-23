import { verifyJoinToken } from '@pong/shared/auth/tokenSign';

// Claims returned by verifyJoinToken, guaranteed non-null after validation
export type VerifiedJoinTokenClaims = NonNullable<ReturnType<typeof verifyJoinToken>>;

export class AuthService {
  verifyJoinToken(token: string, roomIdentifier: string): VerifiedJoinTokenClaims {
    const claims = verifyJoinToken(token);
    if (!claims) {
      throw new Error('invalid-token');
    }
    if (claims.roomIdentifier !== roomIdentifier) {
      throw new Error('room-mismatch');
    }
    if (claims.aud !== 'game-node' || claims.iss !== 'mm') {
      throw new Error('invalid-issuer');
    }
    return claims;
  }
}
