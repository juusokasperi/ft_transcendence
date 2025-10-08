import crypto from 'crypto';
import type { JoinTokenClaims } from '../protocol/net';

const SECRET = process.env.REALTIME_TOKEN_SECRET || 'dev-change-me';

export function signJoinToken(claims: JoinTokenClaims): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyJoinToken(token: string): JoinTokenClaims | null {
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;
  const data = `${header}.${payload}`;
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
