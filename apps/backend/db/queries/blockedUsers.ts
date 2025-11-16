import db from '../client.ts';


export function getBlockedUsernames(blockerUuid: string): string[] {
  try {
    const rows = db
      .prepare(
        `
        SELECT u.username
        FROM BlockedUsers b
        JOIN Users u ON u.uuid = b.blocked_uuid
        WHERE b.blocker_uuid = ?
        `,
      )
      .all(blockerUuid) as { username: string }[];

    if (!rows || rows.length === 0) return [];
    return rows.map((row) => row.username);
  } catch (error) {
    return [];
  }
}

export function blockUser(blockerUuid: string, blockedUuid: string): boolean {
  try {
    const result = db
      .prepare(
        `
        INSERT INTO BlockedUsers (blocker_uuid, blocked_uuid)
        VALUES (?, ?)
        `,
      )
      .run(blockerUuid, blockedUuid);

    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

export function unblockUser(blockerUuid: string, blockedUuid: string): boolean {
  try {
    const result = db
      .prepare(
        `
        DELETE FROM BlockedUsers
        WHERE blocker_uuid = ? AND blocked_uuid = ?
        `,
      )
      .run(blockerUuid, blockedUuid);

    return result.changes === 1;
  } catch (error) {
    return false;
  }
}