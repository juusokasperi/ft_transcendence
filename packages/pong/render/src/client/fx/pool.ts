/**
 * Minimal, fixed-size object pool with explicit warmup.
 * - No per-frame allocations.
 * - Acquire returns null if exhausted (callers may drop or reuse oldest).
 * - Release MUST be called by the effect when finished.
 */
export type Pool<T> = {
  acquire(): T | undefined;
  release(item: T): void;
  warm(size: number): void;
  clear(): void;
  size(): number; // total managed
  available(): number; // currently free
};

export function makePool<T>(
  create: () => T,
  reset: (t: T) => void,
  dispose: (t: T) => void,
): Pool<T> {
  const items: T[] = [];
  const freeIdx: number[] = [];

  const api: Pool<T> = {
    acquire(): T | undefined {
      const idx = freeIdx.pop();
      if (idx === undefined) return undefined;
      return items[idx]!; // idx comes from our own index list → safe
    },

    release(item: T): void {
      reset(item);
      const idx = items.indexOf(item);
      if (idx >= 0) freeIdx.push(idx);
      // else: logic bug upstream; keep silent to avoid spam in hot paths
    },

    warm(n: number): void {
      const target = Math.max(0, n | 0);
      while (items.length < target) {
        const t = create();
        items.push(t);
        freeIdx.push(items.length - 1);
      }
      // Downsizing handled by clear()
    },

    clear(): void {
      // Reverse dispose; no extra arrays/allocs.
      for (let i = items.length - 1; i >= 0; --i) {
        dispose(items[i]!); // loop bounds guarantee defined
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
