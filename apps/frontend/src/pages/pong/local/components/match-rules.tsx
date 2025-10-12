import React, { useState } from 'react';
import type { Ruleset } from '@pong/shared';
import PlayButton from './PlayButton/PlayButton';
import { getBestOf } from '../utils/storage';

type MatchRulesProps = {
  rules: Ruleset;
  onUpdate: (updater: (rules: Ruleset) => Ruleset) => void;
  onReset: () => void;
};

export const MatchRules: React.FC<MatchRulesProps> = ({ rules, onUpdate, onReset }) => {
  const [open, setOpen] = useState(false);

  const updateGame = <K extends keyof Ruleset['game']>(
    key: K,
    value: Ruleset['game'][K],
  ) => {
    onUpdate((prev) => ({
      ...prev,
      game: {
        ...prev.game,
        [key]: value,
      },
    }));
  };

  const updateMatch = <K extends keyof Ruleset['match']>(
    key: K,
    value: Ruleset['match'][K],
  ) => {
    onUpdate((prev) => ({
      ...prev,
      match: {
        ...prev.match,
        [key]: value,
      },
    }));
  };

  return (
    <div className="rounded-md border border-white/10 p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center justify-between"
      >
        <span className="text-2xl font-semibold text-yellow-400">Match Rules</span>
        <span className="text-2xl leading-none text-yellow-400">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-white">
            <label className="flex items-center justify-between">
              <span>Best Of</span>
              <select
                value={rules.match.bestOf}
                onChange={(event) =>
                  updateMatch(
                    'bestOf',
                    getBestOf(event.target.value, rules.match.bestOf),
                  )
                }
                className="rounded bg-gray-800 p-2"
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={7}>7</option>
              </select>
            </label>

            <label className="flex items-center justify-between">
              <span>Target Score</span>
              <input
                type="number"
                min={1}
                value={rules.game.targetScore}
                onChange={(event) =>
                  updateGame('targetScore', Math.max(1, Number(event.target.value)))
                }
                className="w-24 rounded bg-gray-800 p-2"
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Win By</span>
              <input
                type="number"
                min={1}
                value={rules.game.winBy}
                onChange={(event) => updateGame('winBy', Math.max(1, Number(event.target.value)))}
                className="w-24 rounded bg-gray-800 p-2"
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Serves per Turn</span>
              <input
                type="number"
                min={1}
                value={rules.game.servesPerTurn}
                onChange={(event) =>
                  updateGame('servesPerTurn', Math.max(1, Number(event.target.value)))
                }
                className="w-24 rounded bg-gray-800 p-2"
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Deuce Serves per Turn</span>
              <input
                type="number"
                min={1}
                value={rules.game.deuceServesPerTurn}
                onChange={(event) =>
                  updateGame('deuceServesPerTurn', Math.max(1, Number(event.target.value)))
                }
                className="w-24 rounded bg-gray-800 p-2"
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Deciding Game Mid-Swap At</span>
              <input
                type="number"
                min={1}
                value={rules.match.decidingGameMidSwapAtPoints ?? 5}
                onChange={(event) => {
                  const raw = Number(event.target.value);
                  const value = Number.isNaN(raw) ? undefined : raw || undefined;
                  updateMatch('decidingGameMidSwapAtPoints', value);
                }}
                className="w-24 rounded bg-gray-800 p-2"
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Switch Ends Each Game</span>
              <input
                type="checkbox"
                checked={rules.match.switchEndsEachGame}
                onChange={(event) =>
                  updateMatch('switchEndsEachGame', event.target.checked)
                }
                className="h-5 w-5"
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Alternate Initial Server</span>
              <input
                type="checkbox"
                checked={rules.match.alternateInitialServerEachGame}
                onChange={(event) =>
                  updateMatch('alternateInitialServerEachGame', event.target.checked)
                }
                className="h-5 w-5"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <PlayButton color="gold" onClick={onReset}>
              RESET RULES
            </PlayButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchRules;
