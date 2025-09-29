import jwt from 'jsonwebtoken';
import { JWT_ACCESS_TTL, JWT_2FA_TTL, SECRET } from './config';
import type { JWTPayload } from '../types/types';

const JWT_SECRET = SECRET as jwt.Secret;
const ACCESS_TOKEN_EXP = JWT_ACCESS_TTL as unknown as jwt.SignOptions['expiresIn'];
const TWO_FACTOR_EXP = JWT_2FA_TTL as unknown as jwt.SignOptions['expiresIn'];

// JWT payload for access tokens
export type AccessTokenPayload = JWTPayload & { purpose: 'access' };
export type TwoFactorTokenPayload = JWTPayload & { purpose: 'two-factor' };

export type AccessTokenInputPayload = Omit<JWTPayload, 'purpose'>;
export type TwoFactorTokenInputPayload = Omit<JWTPayload, 'purpose'>;

// Sign a JWT access token with 'access' purpose
export function signAccessToken(payload: AccessTokenInputPayload): string {
  const tokenPayload: AccessTokenPayload = { ...payload, purpose: 'access' };
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXP });
}

// Sign a JWT two-factor token with 'two-factor' purpose
export function signTwoFactorToken(payload: TwoFactorTokenInputPayload): string {
  const tokenPayload: TwoFactorTokenPayload = { ...payload, purpose: 'two-factor' };
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TWO_FACTOR_EXP });
}

// Verify and decode an access token, ensuring correct purpose
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
  if (decoded.purpose !== 'access') throw new Error('Invalid token purpose');
  return decoded;
}

// Verify and decode a two-factor token, ensuring correct purpose
export function verifyTwoFactorToken(token: string): TwoFactorTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as TwoFactorTokenPayload;
  if (decoded.purpose !== 'two-factor') throw new Error('Invalid token purpose');
  return decoded;
}
