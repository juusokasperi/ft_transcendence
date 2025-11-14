import db from '../client.ts';
import type { MatchWithPlayers, MatchPlayerPublic } from '@utils/types';
import type { MatchDb, MatchPlayer, MatchWithPlayersForUserDb } from '../../types/dbtypes.ts';
import { logger } from '@utils/logger';

export function addMatchPlayer(
  matchId: number,
  uuid: string,
  team: number,
  rankingDelta: number,
): number {
  try {
    const result = db
      .prepare(
        `
			INSERT INTO MatchPlayers (match_id, user_uuid, team_number, ranking_delta)
			VALUES (?, ?, ?, ?)
			`,
      )
      .run(matchId, uuid, team, rankingDelta);
    return result.lastInsertRowid as number;
  } catch (error) {
    throw new Error(`Failed to add MatchPlayer ${uuid} to match ${matchId}`);
  }
}

export function addMatch(
  team1Score: number,
  team2Score: number,
  tournamentId?: number,
  tournamentStage?: string,
): number {
  try {
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
    throw new Error(`Failed to create match entry`);
  }
}

export function getMatchById(matchId: number): MatchDb | undefined {
  const row = db.prepare('SELECT * FROM Matches WHERE id = ?').get(matchId) as MatchDb | null;
  return row ?? undefined;
}

export function getMatchWithPlayers(matchId: number): MatchWithPlayers | null {
  try {
    const match = db.prepare(`SELECT * FROM Matches where id = ?`).get(matchId) as MatchDb | null;
    if (!match) return null;
    const players = db
      .prepare(
        `
			SELECT
				mp.team_number as teamNumber,
        mp.ranking_delta as rankingDelta,
				u.uuid,
				u.username,
				u.avatar,
				u.ranking,
				u.created_at as createdAt,
        s.points_scored as pointsScored,
        s.points_conceded as pointsConceded,
        s.games_won as gamesWon,
        s.games_lost as gamesLost,
        s.max_point_lead as maxPointLead
			FROM MatchPlayers mp
			LEFT JOIN Users u on mp.user_uuid = u.uuid
        LEFT JOIN MatchPlayerStats s on s.match_player_id = mp.id
			WHERE mp.match_id = ?
			ORDER BY mp.team_number, mp.id
			`,
      )
      .all(matchId) as MatchPlayer[];

    const team1Players = players
      .filter((player) => player.teamNumber === 1)
      .map((player) =>
        player.uuid
          ? ({
              uuid: player.uuid,
              username: player.username!,
              avatar: player.avatar,
              ranking: player.ranking!,
              createdAt: player.createdAt!,
              rankingDelta: player.rankingDelta,
              stats:
                player.pointsScored == null
                  ? undefined
                  : {
                      pointsScored: player.pointsScored,
                      pointsConceded: player.pointsConceded!,
                      gamesWon: player.gamesWon!,
                      gamesLost: player.gamesLost!,
                      maxPointLead: player.maxPointLead!,
                    },
            } as MatchPlayerPublic)
          : null,
      ) as (MatchPlayerPublic | null)[];
    const team2Players = players
      .filter((player) => player.teamNumber === 2)
      .map((player) =>
        player.uuid
          ? ({
              uuid: player.uuid,
              username: player.username!,
              avatar: player.avatar,
              ranking: player.ranking!,
              createdAt: player.createdAt!,
              rankingDelta: player.rankingDelta,
              stats:
                player.pointsScored == null
                  ? undefined
                  : {
                      pointsScored: player.pointsScored,
                      pointsConceded: player.pointsConceded!,
                      gamesWon: player.gamesWon!,
                      gamesLost: player.gamesLost!,
                      maxPointLead: player.maxPointLead!,
                    },
            } as MatchPlayerPublic)
          : null,
      ) as (MatchPlayerPublic | null)[];

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
    const includeLimit = typeof count === 'number' && count > 0;
    const includeOffset = typeof offset === 'number' && offset > 0;
    const limitClause = includeLimit ? 'LIMIT ?' : includeOffset ? 'LIMIT -1' : '';
    const offsetClause = includeOffset ? 'OFFSET ?' : '';
    if (includeLimit) params.push(count as number);
    if (includeOffset) params.push(offset as number);

    const rows = db
      .prepare(
        `
      WITH UserMatches AS (
        SELECT m.id, m.team_1_score, m.team_2_score, m.created_at, m.tournament_id, m.tournament_stage
        FROM Matches m
        INNER JOIN MatchPlayers mp ON mp.match_id = m.id
        WHERE mp.user_uuid = ?
        ORDER BY m.created_at DESC
        ${limitClause}
        ${offsetClause}
      )
      SELECT
        um.id as match_id,
        um.team_1_score,
        um.team_2_score,
        um.created_at as match_created_at,
        um.tournament_id,
        um.tournament_stage,
        mp.team_number,
        mp.ranking_delta,
        u.uuid,
        u.username,
        u.avatar,
        u.ranking,
        u.created_at as user_created_at,
        s.points_scored,
        s.points_conceded,
        s.games_won,
        s.games_lost,
        s.max_point_lead
      FROM UserMatches um
      INNER JOIN MatchPlayers mp ON mp.match_id = um.id
      LEFT JOIN Users u ON mp.user_uuid = u.uuid
      LEFT JOIN MatchPlayerStats s ON s.match_player_id = mp.id
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
          ? ({
              uuid: row.uuid,
              username: row.username!,
              avatar: row.avatar,
              ranking: row.ranking!,
              createdAt: row.user_created_at!,
              rankingDelta: row.ranking_delta!,
              stats:
                row.points_scored == null
                  ? undefined
                  : {
                      pointsScored: row.points_scored,
                      pointsConceded: row.points_conceded!,
                      gamesWon: row.games_won!,
                      gamesLost: row.games_lost!,
                      maxPointLead: row.max_point_lead!,
                    },
            } as MatchPlayerPublic)
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
    logger.error({ error }, 'Error fetching matches for user:');
    return [];
  }
}
