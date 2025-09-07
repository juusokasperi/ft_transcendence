// src/client/fx/pool.ts
/**
 * Minimal, fixed-size object pool with explicit warmup.
 * - No per-frame allocations.
 * - Acquire returns null if exhausted (callers may drop or reuse oldest).
 * - Release MUST be called by the effect when finished.
 */
export type Pool<T> = {
  acquire(): T | null;
  release(item: T): void;
  warm(size: number): void;
  clear(): void;
  size(): number; // total managed
  available(): number; // currently free
};

export function makePool<T>(
  create: () => T,
  reset: (t: T) => void, // called on release before re-queueing
  dispose: (t: T) => void, // called by clear()
): Pool<T> {
  // Free list implemented as indices into `items` to avoid per-frame array allocs.
  const items: T[] = [];
  const freeIdx: number[] = [];

  const api: Pool<T> = {
    acquire(): T | null {
      if (freeIdx.length === 0) return null;
      const idx = freeIdx.pop() as number; // length > 0 guaranteed
      return items[idx];
    },
    release(item: T): void {
      reset(item);
      const idx = items.indexOf(item);
      if (idx >= 0) freeIdx.push(idx);
      // If item wasn't found, it's a logic bug—intentionally silent to avoid spam.
    },
    warm(n: number): void {
      const target = Math.max(0, n | 0);
      while (items.length < target) {
        const t = create();
        items.push(t);
        freeIdx.push(items.length - 1);
      }
      // If items.length > target we keep them; sizing down is handled by clear().
    },
    clear(): void {
      // Dispose in reverse; avoid reallocations.
      for (let i = items.length - 1; i >= 0; --i) {
        dispose(items[i]);
      }
      items.length = 0;
      freeIdx.length = 0;
    },
    size(): number {
      return items.length;
    },
    available(): number {
      return freeIdx.length;
    },
  };

  return api;
}
