// packages/pong/game-logic/src/rules/presets.ts
import type { Ruleset } from '@pong/shared';

export function tableTennisRules(overrides?: Partial<Ruleset>): Ruleset {
  const base = {
    game: {
      targetScore: 11,
      winBy: 2,
      servesPerTurn: 2,
      deuceServesPerTurn: 1,
      // deuceAt omitted — defaulted below to targetScore - 1
    },
    match: {
      bestOf: 5,
      switchEndsEachGame: true,
      decidingGameMidSwapAtPoints: 5,
      alternateInitialServerEachGame: true,
    },
  } satisfies Ruleset;

  const merged: Ruleset = {
    game: { ...base.game, ...(overrides?.game ?? {}) },
    match: { ...base.match, ...(overrides?.match ?? {}) },
  };

  if (merged.game.deuceAt == null) {
    merged.game.deuceAt = merged.game.targetScore - 1;
  }
  return merged;
}
