import db from '../client.ts';
import type { TournamentMatchDb, TournamentMatchPlayerDb } from '../../types/dbtypes.ts';
import type { TournamentMatch, TournamentMatchPlayer } from '../../types/types.ts';

type CreateTournamentMatchInput = {
  tournamentId: number;
  roundNumber: number;
  roundPosition: number;
  status?: string;
  scheduledAt?: string | null;
};

function normalizeDateTime(value: string | null): string | null {
  if (!value) return null;
  if (value.includes('T')) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  const normalized = `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function mapMatchRecord(row: TournamentMatchDb): TournamentMatch {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    roundNumber: row.round_number,
    roundPosition: row.round_position,
    status: row.status,
    matchId: row.match_id,
    scheduledAt: normalizeDateTime(row.scheduled_at),
    completedAt: normalizeDateTime(row.completed_at),
  };
}

function mapMatchPlayerRecord(row: TournamentMatchPlayerDb): TournamentMatchPlayer {
  return {
    id: row.id,
    tournamentMatchId: row.tournament_match_id,
    participantId: row.participant_id,
    teamNumber: row.team_number,
  };
}

export interface TournamentMatchParticipantDetail {
  participantId: number;
  userUuid: string | null;
  alias: string;
  teamNumber: number;
}

export function getTournamentMatchById(id: number): TournamentMatch | undefined {
  const row = db
    .prepare('SELECT * FROM TournamentMatches WHERE id = ?')
    .get(id) as TournamentMatchDb | null;
  if (!row) return undefined;
  return mapMatchRecord(row);
}

export function listTournamentMatches(tournamentId: number): TournamentMatch[] {
  const rows = db
    .prepare(
      'SELECT * FROM TournamentMatches WHERE tournament_id = ? ORDER BY round_number ASC, round_position ASC',
    )
    .all(tournamentId) as TournamentMatchDb[];
  return rows.map(mapMatchRecord);
}

export function createTournamentMatch(
  input: CreateTournamentMatchInput,
): TournamentMatch | undefined {
  try {
    const result = db
      .prepare(
        `
        INSERT INTO TournamentMatches (
          tournament_id,
          round_number,
          round_position,
          status,
          scheduled_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        input.tournamentId,
        input.roundNumber,
        input.roundPosition,
        input.status ?? 'pending',
        input.scheduledAt ?? null,
      );

    const id = result.lastInsertRowid as number;
    return getTournamentMatchById(id);
  } catch (error) {
    return undefined;
  }
}

export function updateTournamentMatchStatus(
  id: number,
  status: string,
  options?: { setCompletedAt?: boolean },
): TournamentMatch | undefined {
  try {
    const setCompleted = options?.setCompletedAt === true;
    const result = db
      .prepare(
        `
        UPDATE TournamentMatches
        SET status = ?, completed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE id = ?
      `,
      )
      .run(status, setCompleted ? 1 : 0, id);

    if (result.changes !== 1) return undefined;
    return getTournamentMatchById(id);
  } catch (error) {
    return undefined;
  }
}

export function scheduleTournamentMatch(
  id: number,
  scheduledAt: string | null,
): TournamentMatch | undefined {
  try {
    const result = db
      .prepare('UPDATE TournamentMatches SET scheduled_at = ? WHERE id = ?')
      .run(scheduledAt, id);
    if (result.changes !== 1) return undefined;
    return getTournamentMatchById(id);
  } catch (error) {
    return undefined;
  }
}

export function linkTournamentMatchResult(
  id: number,
  matchId: number | null,
  options?: { setCompleted?: boolean },
): TournamentMatch | undefined {
  try {
    const result = db
      .prepare(
        `
        UPDATE TournamentMatches
        SET match_id = ?,
            status = CASE WHEN ? THEN 'completed' ELSE status END,
            completed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE id = ?
      `,
      )
      .run(matchId, options?.setCompleted ? 1 : 0, options?.setCompleted ? 1 : 0, id);

    if (result.changes !== 1) return undefined;
    return getTournamentMatchById(id);
  } catch (error) {
    return undefined;
  }
}

export function addTournamentMatchPlayer(
  tournamentMatchId: number,
  participantId: number,
  teamNumber: number,
): TournamentMatchPlayer | undefined {
  try {
    const result = db
      .prepare(
        `
        INSERT INTO TournamentMatchPlayers (tournament_match_id, participant_id, team_number)
        VALUES (?, ?, ?)
      `,
      )
      .run(tournamentMatchId, participantId, teamNumber);

    const id = result.lastInsertRowid as number;
    return getTournamentMatchPlayerById(id);
  } catch (error) {
    return undefined;
  }
}

export function getTournamentMatchPlayerById(id: number): TournamentMatchPlayer | undefined {
  const row = db
    .prepare('SELECT * FROM TournamentMatchPlayers WHERE id = ?')
    .get(id) as TournamentMatchPlayerDb | null;
  if (!row) return undefined;
  return mapMatchPlayerRecord(row);
}

export function listTournamentMatchPlayers(tournamentMatchId: number): TournamentMatchPlayer[] {
  const rows = db
    .prepare(
      'SELECT * FROM TournamentMatchPlayers WHERE tournament_match_id = ? ORDER BY team_number ASC, id ASC',
    )
    .all(tournamentMatchId) as TournamentMatchPlayerDb[];
  return rows.map(mapMatchPlayerRecord);
}

export function getTournamentMatchRoster(matchId: number): TournamentMatchParticipantDetail[] {
  const rows = db
    .prepare(
      `
      SELECT tp.id as participantId, tp.user_uuid as userUuid, tp.alias as alias, tmp.team_number as teamNumber
      FROM TournamentMatchPlayers tmp
      JOIN TournamentParticipants tp ON tp.id = tmp.participant_id
      WHERE tmp.tournament_match_id = ?
      ORDER BY tmp.team_number ASC, tmp.id ASC
    `,
    )
    .all(matchId) as {
    participantId: number;
    userUuid: string | null;
    alias: string;
    teamNumber: number;
  }[];
  return rows;
}

export function removeTournamentMatchPlayer(id: number): boolean {
  try {
    const result = db.prepare('DELETE FROM TournamentMatchPlayers WHERE id = ?').run(id);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

export function clearTournamentMatchPlayers(tournamentMatchId: number): boolean {
  try {
    db.prepare('DELETE FROM TournamentMatchPlayers WHERE tournament_match_id = ?').run(
      tournamentMatchId,
    );
    return true;
  } catch (error) {
    return false;
  }
}

export function getTournamentMatchByRoundAndPosition(
  tournamentId: number,
  roundNumber: number,
  roundPosition: number,
): TournamentMatch | undefined {
  const row = db
    .prepare(
      'SELECT * FROM TournamentMatches WHERE tournament_id = ? AND round_number = ? AND round_position = ?',
    )
    .get(tournamentId, roundNumber, roundPosition) as TournamentMatchDb | null;
  if (!row) return undefined;
  return mapMatchRecord(row);
}

export function setTournamentMatchPlayer(
  tournamentMatchId: number,
  participantId: number,
  teamNumber: number,
): TournamentMatchPlayer | undefined {
  try {
    db.prepare(
      `
      INSERT INTO TournamentMatchPlayers (tournament_match_id, participant_id, team_number)
      VALUES (?, ?, ?)
      ON CONFLICT(tournament_match_id, team_number)
      DO UPDATE SET participant_id = excluded.participant_id
    `,
    ).run(tournamentMatchId, participantId, teamNumber);

    const row = db
      .prepare(
        'SELECT * FROM TournamentMatchPlayers WHERE tournament_match_id = ? AND team_number = ?',
      )
      .get(tournamentMatchId, teamNumber) as TournamentMatchPlayerDb | null;
    if (!row) return undefined;
    return mapMatchPlayerRecord(row);
  } catch (error) {
    return undefined;
  }
}
