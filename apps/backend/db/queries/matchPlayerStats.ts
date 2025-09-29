import db from '../client';
import type { MatchPlayerStats, MatchPlayerStatsMe } from '../../types/types';

export function upsertMatchPlayerStats(
  matchPlayerId: number,
  stats: Partial<MatchPlayerStats>,
): boolean {
  // Normalize inputs and default to 0 where not provided
  const defaults = {
    pointsScored: 0,
    pointsConceded: 0,
    gamesWon: 0,
    gamesLost: 0,
    maxPointLead: 0,
  } satisfies MatchPlayerStats;
  const s: MatchPlayerStats = {
    ...defaults,
    ...stats,
  };

  const existing = db
    .prepare('SELECT id FROM MatchPlayerStats WHERE match_player_id = ?')
    .get(matchPlayerId) as { id: number } | undefined;

  if (!existing) {
    const res = db
      .prepare(
        `
        INSERT INTO MatchPlayerStats (
          match_player_id, points_scored, points_conceded, games_won, games_lost, max_point_lead
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        matchPlayerId,
        s.pointsScored,
        s.pointsConceded,
        s.gamesWon,
        s.gamesLost,
        s.maxPointLead,
      );
    return res.changes === 1;
  }

  const res = db
    .prepare(
      `
      UPDATE MatchPlayerStats
      SET points_scored = ?, points_conceded = ?, games_won = ?, games_lost = ?, max_point_lead = ?
      WHERE match_player_id = ?
    `,
    )
    .run(s.pointsScored, s.pointsConceded, s.gamesWon, s.gamesLost, s.maxPointLead, matchPlayerId);
  // Note: SQLite returns changes = 0 if values are identical.
  // Treat that as success to keep this helper idempotent.
  return res.changes >= 0;
}

// No additional read helpers needed by routes; embedded in match queries.
export function getTotalStatsForUser(uuid: string): MatchPlayerStatsMe | null {
  try {
    const result = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(s.points_scored), 0) as pointsScored,
        COALESCE(SUM(s.points_conceded), 0) as pointsConceded,
        COALESCE(SUM(s.games_won), 0) as gamesWon,
        COALESCE(SUM(s.games_lost), 0) as gamesLost,
        COALESCE(MAX(s.max_point_lead), 0) as maxPointLead,
        SUM(
          CASE
            WHEN (mp.team_number = 1 AND m.team_1_score > m.team_2_score)
              OR (mp.team_number = 2 AND m.team_2_score > m.team_1_score)
            THEN 1 ELSE 0 END
        ) as matchesWon,
        SUM(
          CASE
            WHEN (mp.team_number = 1 AND m.team_1_score < m.team_2_score)
              OR (mp.team_number = 2 AND m.team_2_score < m.team_1_score)
            THEN 1 ELSE 0 END
        ) as matchesLost,
        COALESCE(u.ranking, 0) as ranking
      FROM MatchPlayers mp
      LEFT JOIN MatchPlayerStats s ON s.match_player_id = mp.id
      LEFT JOIN Users u on u.uuid = mp.user_uuid
      LEFT JOIN Matches m ON m.id = mp.match_id
      WHERE mp.user_uuid = ?
      `,
      )
      .get(uuid) as MatchPlayerStatsMe | undefined;
    if (!result) {
      return {
        pointsScored: 0,
        pointsConceded: 0,
        gamesWon: 0,
        gamesLost: 0,
        maxPointLead: 0,
        matchesWon: 0,
        matchesLost: 0,
        ranking: 0,
      };
    }
    return result;
  } catch (error) {
    return null;
  }
}
