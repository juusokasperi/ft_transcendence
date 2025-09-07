// src/shared/utils/random.ts
import type { TableEnd } from "@shared/domain/ids";

export type MatchSeed = number;
export type Rng = () => number;

export interface RandomSource {
  next(): number; // [0,1)
  getSeed(): number; // current 32-bit state
  setSeed(seed: number): void;
}

/** Xorshift32 — tiny, fast, deterministic. */
export function xorshift32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s ^= (s << 13) >>> 0;
    s ^= s >>> 17;
    s ^= (s << 5) >>> 0;
    return (s >>> 0) / 0x100000000;
  };
}

/** Class adapter for legacy code expecting RandomSource. */
export class XorShift32 implements RandomSource {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let s = this.state >>> 0;
    s ^= (s << 13) >>> 0;
    s ^= s >>> 17;
    s ^= (s << 5) >>> 0;
    this.state = s >>> 0;
    return (s >>> 0) / 0x100000000;
  }
  getSeed(): number {
    return this.state >>> 0;
  }
  setSeed(seed: number): void {
    this.state = seed >>> 0;
  }
  static make(seed: number): Rng {
    const i = new XorShift32(seed);
    return () => i.next();
  }
}

/** Pure 32-bit seed derivation from fixed numeric inputs. */
export function deriveSeed32(...parts: readonly number[]): number {
  // SplitMix-ish mixer, stable for given inputs.
  let s = 0x9e3779b9 >>> 0;
  for (let i = 0; i < parts.length; i++) {
    let p = (parts[i] | 0) >>> 0;
    p ^= p >>> 16;
    p = (p * 0x7feb352d) >>> 0;
    p ^= p >>> 15;
    p = (p * 0x846ca68b) >>> 0;
    s ^= p;
    s = (s * 0x9e3779b1) >>> 0;
  }
  return s >>> 0;
}

/** Deterministic initial server decision from a seed. */
export function pickInitialServer(seed: MatchSeed): TableEnd {
  return (seed & 1) === 0 ? "east" : "west";
}
