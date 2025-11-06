import { describe, expect, it } from 'vitest';
import { filterTournamentsForDisplay } from '../filter';
import type { TournamentSummary } from '../../state/types';

const make = (overrides: Partial<TournamentSummary> = {}): TournamentSummary => ({
  id: overrides.id ?? 1,
  name: overrides.name ?? 'T1',
  status: overrides.status ?? 'draft',
  maxParticipants: overrides.maxParticipants ?? 4,
  createdAt: overrides.createdAt ?? new Date(0).toISOString(),
  updatedAt: overrides.updatedAt,
  startAt: overrides.startAt,
  completedAt: overrides.completedAt ?? null,
});

describe('filterTournamentsForDisplay', () => {
  it('keeps only draft and active statuses', () => {
    const now = Date.now();
    const list = [
      make({ id: 1, status: 'draft', updatedAt: new Date(now - 1000).toISOString() }),
      make({ id: 2, status: 'active', updatedAt: new Date(now - 2000).toISOString() }),
      make({ id: 3, status: 'completed', updatedAt: new Date(now - 3000).toISOString() }),
      make({ id: 4, status: 'cancelled', updatedAt: new Date(now - 4000).toISOString() }),
    ];
    const res = filterTournamentsForDisplay(list, { now, currentId: null });
    expect(res.map((t) => t.id)).toEqual([1, 2]);
  });

  it('deduplicates by id, keeping the newest timestamped item', () => {
    const now = Date.now();
    const list = [
      make({ id: 1, status: 'draft', updatedAt: new Date(now - 5000).toISOString() }),
      make({ id: 1, status: 'active', updatedAt: new Date(now - 1000).toISOString() }),
      make({ id: 2, status: 'active', updatedAt: new Date(now - 3000).toISOString() }),
    ];
    const res = filterTournamentsForDisplay(list, { now, currentId: null });
    expect(res.find((t) => t.id === 1)?.status).toBe('active');
  });

  it('prioritizes recent tournaments and always includes currentId', () => {
    const now = Date.now();
    const oldTs = new Date(now - 1000 * 60 * 60 * 24).toISOString(); // old
    const recentTs = new Date(now - 1000 * 60 * 5).toISOString(); // 5 min
    const list = [
      make({ id: 1, status: 'active', updatedAt: oldTs }),
      make({ id: 2, status: 'active', updatedAt: recentTs }),
      make({ id: 3, status: 'draft', updatedAt: recentTs }),
    ];
    const res = filterTournamentsForDisplay(list, { now, currentId: 1 });
    // currentId (1) should be included even if old, and recent items sorted first
    expect(res.map((t) => t.id)).toContain(1);
    expect(res[0]!.id).toBe(2);
  });
});
