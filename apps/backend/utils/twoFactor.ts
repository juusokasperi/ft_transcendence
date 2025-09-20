import { authenticator } from 'otplib';
import { TFA_CODE_DIGITS, TFA_ISSUER } from './config.ts';

const AUTH_DIGITS = Math.min(Math.max(TFA_CODE_DIGITS, 4), 10);
authenticator.options = {
  digits: AUTH_DIGITS,
  step: 30,
  window: 1,
};

type SecretParams = {
  label: string;
};

export function generateAuthenticatorSecret({ label }: SecretParams) {
  const sanitizedLabel = label.trim() || 'user';
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(sanitizedLabel, TFA_ISSUER, secret);
  return { secret, otpauthUrl };
}

export function verifyTotpToken(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  const normalized = token.replace(/\s+/g, '');
  return authenticator.check(normalized, secret);
}
