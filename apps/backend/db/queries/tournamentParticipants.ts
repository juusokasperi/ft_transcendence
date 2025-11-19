import db from '../client.ts';
import type { TournamentParticipantDb } from '../../types/dbtypes.ts';
import type { TournamentParticipant } from '../../types/types.ts';

type CreateTournamentParticipantInput = {
  tournamentId: number;
  alias: string;
  userUuid?: string | null;
  seed?: number | null;
  status?: string;
};

type ParticipantUpdates = {
  status?: string;
  seed?: number | null;
  alias?: string;
  userUuid?: string | null;
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

function mapParticipantRecord(row: TournamentParticipantDb): TournamentParticipant {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    userUuid: row.user_uuid,
    alias: row.alias,
    seed: row.seed,
    status: row.status,
    joinedAt: normalizeDateTime(row.joined_at)!,
  };
}

export function getTournamentParticipantById(id: number): TournamentParticipant | undefined {
  const row = db
    .prepare('SELECT * FROM TournamentParticipants WHERE id = ?')
    .get(id) as TournamentParticipantDb | null;
  if (!row) return undefined;
  return mapParticipantRecord(row);
}

export function getTournamentParticipantByAlias(
  tournamentId: number,
  alias: string,
): TournamentParticipant | undefined {
  const row = db
    .prepare('SELECT * FROM TournamentParticipants WHERE tournament_id = ? AND alias = ?')
    .get(tournamentId, alias) as TournamentParticipantDb | null;
  if (!row) return undefined;
  return mapParticipantRecord(row);
}

export function listTournamentParticipants(tournamentId: number): TournamentParticipant[] {
  const rows = db
    .prepare(
      'SELECT * FROM TournamentParticipants WHERE tournament_id = ? ORDER BY joined_at ASC, id ASC',
    )
    .all(tournamentId) as TournamentParticipantDb[];
  return rows.map(mapParticipantRecord);
}

export function createTournamentParticipant(
  input: CreateTournamentParticipantInput,
): TournamentParticipant | undefined {
  try {
    const result = db
      .prepare(
        `
        INSERT INTO TournamentParticipants (
          tournament_id,
          user_uuid,
          alias,
          seed,
          status
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        input.tournamentId,
        input.userUuid ?? null,
        input.alias,
        input.seed ?? null,
        input.status ?? 'pending',
      );

    const id = result.lastInsertRowid as number;
    return getTournamentParticipantById(id);
  } catch (error) {
    return undefined;
  }
}

export function updateTournamentParticipant(
  id: number,
  updates: ParticipantUpdates,
): TournamentParticipant | undefined {
  const assignments: string[] = [];
  const values: (string | number | null)[] = [];

  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    assignments.push('status = ?');
    values.push(updates.status ?? 'pending');
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'seed')) {
    assignments.push('seed = ?');
    values.push(updates.seed ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'alias')) {
    assignments.push('alias = ?');
    values.push(updates.alias ?? '');
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'userUuid')) {
    assignments.push('user_uuid = ?');
    values.push(updates.userUuid ?? null);
  }

  if (!assignments.length) return getTournamentParticipantById(id);

  try {
    const result = db
      .prepare(`UPDATE TournamentParticipants SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...values, id);

    if (result.changes !== 1) return undefined;
    return getTournamentParticipantById(id);
  } catch (error) {
    return undefined;
  }
}

export function removeTournamentParticipant(id: number): boolean {
  try {
    const result = db.prepare('DELETE FROM TournamentParticipants WHERE id = ?').run(id);
    return result.changes === 1;
  } catch (error) {
    return false;
  }
}

export function updateParticipantAliasesForUser(userUuid: string, alias: string): boolean {
  try {
    const result = db
      .prepare('UPDATE TournamentParticipants SET alias = ? WHERE user_uuid = ?')
      .run(alias, userUuid);
    return result.changes > 0;
  } catch {
    return false;
  }
}
