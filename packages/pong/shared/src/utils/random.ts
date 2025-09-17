import type { TableEnd } from '../domain/ids';

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
  for (let part of parts) {
    let p = (part | 0) >>> 0;
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
  return (seed & 1) === 0 ? 'east' : 'west';
}

/**
 * Generate a 32-bit random seed using the most secure source available.
 * - Prefers `crypto.getRandomValues` in browsers and Node 19+.
 * - Falls back to a mixed seed from time and Math.random if crypto is unavailable.
 */
export function randomSeed32(): number {
  try {
    // Browser / modern Node
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;
    if (g?.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      g.crypto.getRandomValues(buf);
      return buf[0]! >>> 0;
    }
  } catch {
    // ignore and fall through to fallback
  }

  // Fallback: mix available clocks and Math.random into a 32-bit seed
  const nowMs = Date.now() | 0;
  const perfUs = Math.floor(((globalThis as any)?.performance?.now?.() ?? 0) * 1000) | 0;
  const rnd = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return deriveSeed32(nowMs, perfUs, rnd);
}
