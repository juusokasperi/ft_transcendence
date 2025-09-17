import db from '../client.ts';
import type { MatchWithPlayers, PublicUser } from '../../types/types.ts';
import type { MatchDb, MatchPlayerDb, MatchWithPlayersForUserDb } from '../../types/dbtypes.ts';

function addMatchHelper(
  team1Score: number,
  team2Score: number,
  tournamentId?: number,
  tournamentStage?: string,
): number | null {
  try {
    console.log('addMatchHelper args:', team1Score, team2Score, tournamentId, tournamentStage);
    const result = db
      .prepare(
        `
			INSERT INTO Matches (team_1_score, team_2_score, tournament_id, tournament_stage)
			VALUES (?, ?, ?, ?)
			`,
      )
      .run(team1Score, team2Score, tournamentId ?? null, tournamentStage ?? null);
    return result.lastInsertRowid as number;
  } catch (error) {
    return null;
  }
}

function addMatchPlayerHelper(
  matchId: number,
  uuid: string,
  team: number,
  pointsAwarded: number,
): number | null {
  try {
    const result = db
      .prepare(
        `
			INSERT INTO MatchPlayers (match_id, user_uuid, team_number, points_awarded)
			VALUES (?, ?, ?, ?)
			`,
      )
      .run(matchId, uuid, team, pointsAwarded);
    return result.lastInsertRowid as number;
  } catch (error) {
    return null;
  }
}

export function addMatch(
  team1Score: number,
  team2Score: number,
  team1Player: string,
  team2Player: string,
  team1Points: number,
  team2Points: number,
  tournamentId?: number,
  tournamentStage?: string,
): number | null;
export function addMatch(
  team1Score: number,
  team2Score: number,
  team1Players: string[],
  team2Players: string[],
  team1Points: number,
  team2Points: number,
  tournamentId?: number,
  tournamentStage?: string,
): number | null;
export function addMatch(
  team1Score: number,
  team2Score: number,
  team1: string | string[],
  team2: string | string[],
  team1Points: number,
  team2Points: number,
  tournamentId?: number,
  tournamentStage?: string,
): number | null {
  const transaction = db.transaction(() => {
    let matchId;
    if (tournamentId !== undefined && tournamentStage !== undefined)
      matchId = addMatchHelper(team1Score, team2Score, tournamentId, tournamentStage);
    else matchId = addMatchHelper(team1Score, team2Score);

    if (!matchId) throw new Error('Failed to create match');

    const team1Players = Array.isArray(team1) ? team1 : [team1];
    const team2Players = Array.isArray(team2) ? team2 : [team2];

    for (const playerId of team1Players) {
      const result = addMatchPlayerHelper(matchId, playerId, 1, team1Points);
      if (!result) throw new Error(`Failed to add team 1 player: ${playerId}`);
    }
    for (const playerId of team2Players) {
      const result = addMatchPlayerHelper(matchId, playerId, 2, team2Points);
      if (!result) throw new Error(`Failed to add team 2 player: ${playerId}`);
    }

    return matchId;
  });

  try {
    return transaction();
  } catch (error) {
    return null;
  }
}

export function getMatchWithPlayers(matchId: number): MatchWithPlayers | null {
  try {
    const match = db.prepare(`SELECT * FROM Matches where id = ?`).get(matchId) as MatchDb | null;
    if (!match) return null;
    const players = db
      .prepare(
        `
			SELECT
				mp.team_number,
				u.uuid,
				u.username,
				u.avatar,
				u.ranking,
				u.created_at
			FROM MatchPlayers mp
			LEFT JOIN Users u on mp.user_uuid = u.uuid
			WHERE mp.match_id = ?
			ORDER BY mp.team_number, mp.id
			`,
      )
      .all(matchId) as MatchPlayerDb[];

    const team1Players = players
      .filter((player) => player.team_number === 1)
      .map((player) =>
        player.uuid
          ? {
              uuid: player.uuid,
              username: player.username,
              avatar: player.avatar,
              ranking: player.ranking,
              createdAt: player.created_at,
            }
          : null,
      ) as (PublicUser | null)[];
    const team2Players = players
      .filter((player) => player.team_number === 2)
      .map((player) =>
        player.uuid
          ? {
              uuid: player.uuid,
              username: player.username,
              avatar: player.avatar,
              ranking: player.ranking,
              createdAt: player.created_at,
            }
          : null,
      ) as (PublicUser | null)[];

    return {
      id: match.id,
      team1Score: match.team_1_score,
      team2Score: match.team_2_score,
      players: {
        team1: team1Players,
        team2: team2Players,
      },
      playedAt: match.created_at,
      tournamentId: match.tournament_id,
      tournamentStage: match.tournament_stage,
    };
  } catch (error) {
    return null;
  }
}

export function getMatchesWithPlayersForUser(
  uuid: string,
  count?: number,
  offset?: number,
): MatchWithPlayers[] {
  try {
    if (count && count <= 0) return [];
    const params: any[] = [uuid];
    if (count) params.push(count);
    if (offset) params.push(offset);

    const rows = db
      .prepare(
        `
      WITH UserMatches AS (
        SELECT m.id, m.team_1_score, m.team_2_score, m.created_at, m.tournament_id, m.tournament_stage
        FROM Matches m
        INNER JOIN MatchPlayers mp ON mp.match_id = m.id
        WHERE mp.user_uuid = ?
        ORDER BY m.created_at DESC
        ${count ? 'LIMIT ?' : ''}
        ${offset ? 'OFFSET ?' : ''}
      )
      SELECT
        um.id as match_id,
        um.team_1_score,
        um.team_2_score,
        um.created_at as match_created_at,
        um.tournament_id,
        um.tournament_stage,
        mp.team_number,
        u.uuid,
        u.username,
        u.avatar,
        u.ranking,
        u.created_at as user_created_at
      FROM UserMatches um
      INNER JOIN MatchPlayers mp ON mp.match_id = um.id
      LEFT JOIN Users u ON mp.user_uuid = u.uuid
      ORDER BY um.created_at DESC, mp.team_number, mp.id
      `,
      )
      .all(...params) as MatchWithPlayersForUserDb[];
    const matchesMap = new Map<number, MatchWithPlayers & { userTeam: number | null }>();

    for (const row of rows) {
      if (!matchesMap.has(row.match_id)) {
        matchesMap.set(row.match_id, {
          id: row.match_id,
          team1Score: row.team_1_score,
          team2Score: row.team_2_score,
          players: { team1: [], team2: [] },
          playedAt: row.match_created_at,
          tournamentId: row.tournament_id ?? null,
          tournamentStage: row.tournament_stage ?? null,
          userTeam: null,
        });
      }
      const match = matchesMap.get(row.match_id)!;
      const player =
        row.uuid != null
          ? {
              uuid: row.uuid,
              username: row.username,
              avatar: row.avatar,
              ranking: row.ranking,
              createdAt: row.user_created_at,
            }
          : null;
      if (row.uuid === uuid) (match as any).userTeam = row.team_number;
      if (row.team_number === 1) {
        match.players.team1.push(player);
      } else if (row.team_number === 2) {
        match.players.team2.push(player);
      }
    }

    return Array.from(matchesMap.values()).map((match) => {
      if (match.userTeam === 2) {
        return {
          id: match.id,
          team1Score: match.team2Score,
          team2Score: match.team1Score,
          players: {
            team1: match.players.team2,
            team2: match.players.team1,
          },
          playedAt: match.playedAt,
          tournamentId: match.tournamentId,
          tournamentStage: match.tournamentStage,
        };
      }

      const { userTeam, ...matchWithoutUserTeam } = match;
      return matchWithoutUserTeam;
    });
  } catch (error) {
    console.error('Error fetching matches for user:', error);
    return [];
  }
}
