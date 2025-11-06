import { MAX_VISIBLE_TOURNAMENTS, RECENT_TOURNAMENT_WINDOW_MS } from '../config';
import type { TournamentSummary } from '../state/types';

export type FilterOptions = {
  now: number;
  currentId: number | null;
};

/**
 * Pure helper to filter and sort tournaments for display.
 * - Keeps only 'draft' and 'active'
 * - Deduplicates by id, keeping the most recently updated variant
 * - Prioritizes "recent" tournaments (within RECENT_TOURNAMENT_WINDOW_MS) and the current one
 * - Caps to MAX_VISIBLE_TOURNAMENTS
 */
export function filterTournamentsForDisplay(
  incoming: TournamentSummary[],
  { now, currentId }: FilterOptions,
): TournamentSummary[] {
  const parseTimestamp = (value?: string | null): number | null => {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const resolveTimestamp = (item: TournamentSummary): number | null => {
    const candidates: Array<string | null | undefined> = [
      item.updatedAt,
      item.startAt,
      item.createdAt,
    ];
    for (const candidate of candidates) {
      const parsed = parseTimestamp(candidate);
      if (parsed !== null) return parsed;
    }
    return null;
  };

  const byStatus = incoming.filter((tournament) => ['draft', 'active'].includes(tournament.status));
  if (byStatus.length === 0) return [];

  // Deduplicate by id, keeping the newest timestamped one
  const unique = new Map<number, TournamentSummary>();
  byStatus.forEach((item) => {
    const existing = unique.get(item.id);
    if (!existing) {
      unique.set(item.id, item);
      return;
    }
    const existingTime = resolveTimestamp(existing) ?? Number.NEGATIVE_INFINITY;
    const candidateTime = resolveTimestamp(item) ?? Number.NEGATIVE_INFINITY;
    if (candidateTime >= existingTime) {
      unique.set(item.id, item);
    }
  });

  const recent: TournamentSummary[] = [];
  const fallbackPool: TournamentSummary[] = [];

  for (const item of unique.values()) {
    const timestamp = resolveTimestamp(item);
    const isCurrent = currentId !== null && item.id === currentId;
    const isRecent = timestamp !== null && now - timestamp <= RECENT_TOURNAMENT_WINDOW_MS;
    if (isCurrent || isRecent) {
      recent.push(item);
    } else {
      fallbackPool.push(item);
    }
  }

  const sortByTimestampDesc = (left: TournamentSummary, right: TournamentSummary) => {
    const leftTs = resolveTimestamp(left);
    const rightTs = resolveTimestamp(right);
    if (leftTs === null && rightTs === null) return 0;
    if (leftTs === null) return 1;
    if (rightTs === null) return -1;
    return rightTs - leftTs;
  };

  recent.sort(sortByTimestampDesc);
  fallbackPool.sort(sortByTimestampDesc);

  if (recent.length >= MAX_VISIBLE_TOURNAMENTS) {
    return recent.slice(0, MAX_VISIBLE_TOURNAMENTS);
  }

  const combined = [...recent];
  for (const item of fallbackPool) {
    combined.push(item);
    if (combined.length >= MAX_VISIBLE_TOURNAMENTS) break;
  }

  return combined;
}

