// src/shared/utils/raf-ticker.ts
export type RafTickFn = (dtMs: number) => void;

/** requestAnimationFrame-based ticker (idempotent start/stop). */
export class RafTicker {
  private rafId: number | null = null;
  private last = 0;

  constructor(private cb: RafTickFn) {}

  start(): void {
    if (this.rafId !== null) return;
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = t - this.last;
      this.last = t;
      this.cb(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
