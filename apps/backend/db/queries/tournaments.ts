import db from '../client.ts';
import type { TournamentDb } from '../../types/dbtypes.ts';
import type { Tournament } from '../../types/types.ts';

type CreateTournamentInput = {
  name: string;
  description?: string;
  format?: string;
  status?: string;
  maxParticipants?: number | null;
  startAt?: string | null;
};

function mapTournamentRecord(row: TournamentDb): Tournament {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    format: row.format,
    status: row.status,
    maxParticipants: row.max_participants,
    startAt: row.start_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  const rows = db.prepare('SELECT * FROM Tournaments ORDER BY created_at DESC').all() as TournamentDb[];
  return rows.map(mapTournamentRecord);
}

export function createTournament(input: CreateTournamentInput): Tournament | undefined {
  try {
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
        input.maxParticipants ?? null,
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
