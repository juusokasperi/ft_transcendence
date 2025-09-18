import db from '../client.ts';
import type { PublicUser, UserStats } from '../../types/types.ts';
import type { PublicUserDb, UserStatsDb } from '../../types/dbtypes.ts';

export function getFriends(user1Uuid: string): UserStats[] {
  try {
    const results = db
      .prepare(
        `
		SELECT
			u.username, u.uuid, u.avatar, u.ranking, u.created_at,
			COUNT(m.id) as total_matches,
			COUNT(CASE
				WHEN (mp.team_number = 1 AND m.team_1_score > m.team_2_score)
				  OR (mp.team_number = 2 AND m.team_2_score > m.team_1_score)
				THEN 1 END) as wins,
			COUNT(CASE
				WHEN (mp.team_number = 1 AND m.team_1_score < m.team_2_score)
				  OR (mp.team_number = 2 AND m.team_2_score < m.team_1_score)
				THEN 1 END) as losses,
			CASE
				WHEN u.last_seen >= datetime('now', '-5 minutes') THEN 1
				ELSE 0
			END as online
			FROM Friends f
			JOIN Users u on u.uuid = (
				CASE
					WHEN f.friend_1_uuid = ?
						THEN f.friend_2_uuid
					ELSE f.friend_1_uuid
				END)
			LEFT JOIN MatchPlayers mp on u.uuid = mp.user_uuid
			LEFT JOIN Matches m on mp.match_id = m.id
			WHERE (f.friend_1_uuid = ? OR f.friend_2_uuid = ?) AND f.accepted = true
			GROUP BY u.uuid
		`,
      )
      .all(user1Uuid, user1Uuid, user1Uuid) as UserStatsDb[];
    if (!results || results.length === 0) return [];
    return results.map((dbUser) => ({
      username: dbUser.username,
      uuid: dbUser.uuid,
      avatar: dbUser.avatar,
      ranking: dbUser.ranking,
      createdAt: dbUser.created_at,
      wins: dbUser.wins,
      losses: dbUser.losses,
      totalMatches: dbUser.total_matches,
      online: !!dbUser.online,
    }));
  } catch (error) {
    return [];
  }
}

// Pending requests sent to me (I can accept / decline)
export function getPendingFriendRequestsReceived(user1Uuid: string): PublicUser[] {
  try {
    const results = db
      .prepare(
        `
		SELECT
			u.username, u.uuid, u.avatar, u.ranking
			FROM Friends f
			JOIN Users u on u.uuid = f.friend_1_uuid
			WHERE f.friend_2_uuid = ? AND f.accepted = false
		`,
      )
      .all(user1Uuid) as PublicUserDb[];
    if (!results || results.length === 0) return [];
    return results.map((userInDb) => ({
      username: userInDb.username,
      uuid: userInDb.uuid,
      avatar: userInDb.avatar,
      ranking: userInDb.ranking,
      createdAt: userInDb.created_at,
    }));
  } catch (error) {
    return [];
  }
}

// Pending requests sent by me (waiting for response)
export function getPendingFriendRequestsSent(user1Uuid: string): PublicUser[] {
  try {
    const results = db
      .prepare(
        `
		SELECT
			u.username, u.uuid, u.avatar, u.ranking
			FROM Friends f
			JOIN Users u on u.uuid = f.friend_2_uuid
			WHERE f.friend_1_uuid = ? AND f.accepted = false
		`,
      )
      .all(user1Uuid) as PublicUserDb[];
    if (!results || results.length === 0) return [];
    return results.map((userInDb) => ({
      username: userInDb.username,
      uuid: userInDb.uuid,
      avatar: userInDb.avatar,
      ranking: userInDb.ranking,
      createdAt: userInDb.created_at,
    }));
  } catch (error) {
    return [];
  }
}

export function respondToFriendReq(recipient: string, sender: string, accept: boolean): boolean {
  try {
    let result;
    if (accept === true) {
      result = db
        .prepare(
          `
				UPDATE Friends
				SET accepted = true
				WHERE	friend_1_uuid = ? AND friend_2_uuid = ? AND accepted = false
				`,
        )
        .run(sender, recipient);
    } else {
      result = db
        .prepare(
          `
				DELETE FROM Friends
				WHERE	friend_1_uuid = ? AND friend_2_uuid = ? AND accepted = false
				`,
        )
        .run(sender, recipient);
    }
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

export function addFriend(user1Uuid: string, user2Uuid: string): boolean {
  try {
    const result = db
      .prepare(
        `
			INSERT INTO Friends (friend_1_uuid, friend_2_uuid)
			VALUES (?, ?)
			`,
      )
      .run(user1Uuid, user2Uuid);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

export function deleteFriend(user1Uuid: string, user2Uuid: string): boolean {
  try {
    const result = db
      .prepare(
        `
			DELETE FROM Friends
			WHERE	(friend_1_uuid = ? AND friend_2_uuid = ?)
				OR	(friend_1_uuid = ? AND friend_2_uuid = ?)
			`,
      )
      .run(user1Uuid, user2Uuid, user2Uuid, user1Uuid);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}
