import db from '../client.ts';
import type { MatchPlayerStats } from '../../types/types.ts';

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
    .run(
      s.pointsScored,
      s.pointsConceded,
      s.gamesWon,
      s.gamesLost,
      s.maxPointLead,
      matchPlayerId,
    );
  // Note: SQLite returns changes = 0 if values are identical.
  // Treat that as success to keep this helper idempotent.
  return res.changes >= 0;
}

// No additional read helpers needed by routes; embedded in match queries.
