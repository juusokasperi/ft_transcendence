import type { GameState } from '../model/state';
export declare function clampZ(z: number, min: number, max: number): number;
export declare function isServePhase(p: GameState['phase']): boolean;
export declare function isPauseBtwPoints(p: GameState['phase']): p is 'pauseBtwPoints';
export declare function isRallyPhase(p: GameState['phase']): p is 'rally';
//# sourceMappingURL=utils.d.ts.map