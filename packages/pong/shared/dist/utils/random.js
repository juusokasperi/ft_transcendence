/** Xorshift32 — tiny, fast, deterministic. */
export function xorshift32(seed) {
    let s = seed >>> 0;
    return () => {
        s ^= (s << 13) >>> 0;
        s ^= s >>> 17;
        s ^= (s << 5) >>> 0;
        return (s >>> 0) / 0x100000000;
    };
}
/** Class adapter for legacy code expecting RandomSource. */
export class XorShift32 {
    state;
    constructor(seed) {
        this.state = seed >>> 0;
    }
    next() {
        let s = this.state >>> 0;
        s ^= (s << 13) >>> 0;
        s ^= s >>> 17;
        s ^= (s << 5) >>> 0;
        this.state = s >>> 0;
        return (s >>> 0) / 0x100000000;
    }
    getSeed() {
        return this.state >>> 0;
    }
    setSeed(seed) {
        this.state = seed >>> 0;
    }
    static make(seed) {
        const i = new XorShift32(seed);
        return () => i.next();
    }
}
/** Pure 32-bit seed derivation from fixed numeric inputs. */
export function deriveSeed32(...parts) {
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
export function pickInitialServer(seed) {
    return (seed & 1) === 0 ? 'east' : 'west';
}
//# sourceMappingURL=random.js.map