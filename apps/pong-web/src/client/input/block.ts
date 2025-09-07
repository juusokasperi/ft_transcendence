// src/client/input/core/block.ts
let blockedUntil = 0;

export function blockInputFor(ms: number): void {
  blockedUntil = Math.max(blockedUntil, performance.now() + ms);
}

export function isInputBlocked(): boolean {
  return performance.now() < blockedUntil;
}
