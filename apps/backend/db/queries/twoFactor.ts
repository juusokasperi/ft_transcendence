import db from '../client.ts';

export function beginTwoFactorEnrollment(uuid: string, secret: string | null): boolean {
  const result = db
    .prepare(
      `UPDATE Users
       SET tfa_secret = ?,
           tfa = 0
       WHERE uuid = ?`,
    )
    .run(secret, uuid);
  return result.changes === 1;
}

export function completeTwoFactorEnrollment(uuid: string, secret: string | null = null): boolean {
  const result = db
    .prepare(
      `UPDATE Users
       SET tfa = 1,
           tfa_secret = COALESCE(?, tfa_secret)
       WHERE uuid = ?`,
    )
    .run(secret, uuid);
  return result.changes === 1;
}

export function disableTwoFactor(uuid: string): boolean {
  const result = db
    .prepare(
      `UPDATE Users
       SET tfa = 0,
           tfa_secret = NULL
       WHERE uuid = ?`,
    )
    .run(uuid);
  return result.changes === 1;
}
