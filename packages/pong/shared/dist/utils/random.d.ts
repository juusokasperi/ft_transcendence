import type { TableEnd } from '../domain/ids';
export type MatchSeed = number;
export type Rng = () => number;
export interface RandomSource {
    next(): number;
    getSeed(): number;
    setSeed(seed: number): void;
}
/** Xorshift32 — tiny, fast, deterministic. */
export declare function xorshift32(seed: number): Rng;
/** Class adapter for legacy code expecting RandomSource. */
export declare class XorShift32 implements RandomSource {
    private state;
    constructor(seed: number);
    next(): number;
    getSeed(): number;
    setSeed(seed: number): void;
    static make(seed: number): Rng;
}
/** Pure 32-bit seed derivation from fixed numeric inputs. */
export declare function deriveSeed32(...parts: readonly number[]): number;
/** Deterministic initial server decision from a seed. */
export declare function pickInitialServer(seed: MatchSeed): TableEnd;
//# sourceMappingURL=random.d.ts.map