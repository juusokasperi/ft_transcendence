import { verifyJoinToken } from '@pong/shared/auth/tokenSign';

export type JoinTokenClaims = ReturnType<typeof verifyJoinToken>;

export class AuthService {
  verifyJoinToken(token: string, roomIdentifier: string): JoinTokenClaims {
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
