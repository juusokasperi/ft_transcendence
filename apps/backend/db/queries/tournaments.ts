import db from '../client.ts';
import type { TournamentDb } from '../../types/dbtypes.ts';
import type { Tournament } from '../../types/types.ts';

type TournamentWithParticipantRow = TournamentDb & { participant_id: number };

type CreateTournamentInput = {
  name: string;
  description?: string;
  format?: string;
  status?: string;
  maxParticipants?: number | null;
  startAt?: string | null;
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

function mapTournamentRecord(row: TournamentDb): Tournament {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    format: row.format,
    status: row.status,
    maxParticipants: row.max_participants,
    startAt: normalizeDateTime(row.start_at),
    completedAt: normalizeDateTime(row.completed_at),
    createdAt: normalizeDateTime(row.created_at)!,
    updatedAt: normalizeDateTime(row.updated_at)!,
  };
}

export function getTournamentById(id: number): Tournament | undefined {
  const row = db.prepare('SELECT * FROM Tournaments WHERE id = ?').get(id) as TournamentDb | null;
  if (!row) return undefined;
  return mapTournamentRecord(row);
}

export function listTournaments(options?: { status?: string }): Tournament[] {
  if (options?.status) {
    const rows = db
      .prepare('SELECT * FROM Tournaments WHERE status = ? ORDER BY created_at DESC')
      .all(options.status) as TournamentDb[];
    return rows.map(mapTournamentRecord);
  }
  const rows = db
    .prepare('SELECT * FROM Tournaments ORDER BY created_at DESC')
    .all() as TournamentDb[];
  return rows.map(mapTournamentRecord);
}

export function createTournament(input: CreateTournamentInput): Tournament | undefined {
  try {
    const maxParticipants = input.maxParticipants ?? 4;
    const result = db
      .prepare(
        `
        INSERT INTO Tournaments (
          name,
          description,
          format,
          status,
          max_participants,
          start_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        input.name,
        input.description ?? '',
        input.format ?? 'single_elimination',
        input.status ?? 'draft',
        maxParticipants,
        input.startAt ?? null,
      );

    const id = result.lastInsertRowid as number;
    return getTournamentById(id);
  } catch (error) {
    return undefined;
  }
}

export function updateTournamentStatus(id: number, status: string): Tournament | undefined {
  try {
    const result = db
      .prepare(
        `
        UPDATE Tournaments
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(status, id);

    if (result.changes !== 1) return undefined;
    return getTournamentById(id);
  } catch (error) {
    return undefined;
  }
}

export function markTournamentCompleted(id: number): Tournament | undefined {
  try {
    const result = db
      .prepare(
        `
        UPDATE Tournaments
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(id);

    if (result.changes !== 1) return undefined;
    return getTournamentById(id);
  } catch (error) {
    return undefined;
  }
}

export function findUserActiveTournament(
  userUuid: string,
): { tournament: Tournament; participantId: number } | undefined {
  const row = db
    .prepare(
      `
      SELECT t.*, p.id AS participant_id
      FROM Tournaments t
      INNER JOIN TournamentParticipants p ON p.tournament_id = t.id
      WHERE p.user_uuid = ?
        AND t.status IN ('draft', 'active')
        AND p.status != 'forfeited'
      ORDER BY t.updated_at DESC, t.id DESC
      LIMIT 1
    `,
    )
    .get(userUuid) as TournamentWithParticipantRow | null;

  if (!row) return undefined;

  const tournament = mapTournamentRecord(row as TournamentDb);
  return {
    tournament,
    participantId: row.participant_id,
  };
}
