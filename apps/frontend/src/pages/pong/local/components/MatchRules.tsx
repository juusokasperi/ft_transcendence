import React, { useCallback, useId, useState } from 'react';
import type { Ruleset } from '@pong/shared';
import PlayButton from './PlayButton';
import { getBestOf } from '../utils/storage';

type MatchRulesProps = {
  rules: Ruleset;
  onUpdate: (updater: (rules: Ruleset) => Ruleset) => void;
  onReset: () => void;
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Small, dependency-free tooltip with hover & keyboard focus support. */
const InfoTip: React.FC<{ text: string; side?: 'left' | 'right' }> = ({ text, side = 'left' }) => {
  const id = useId();
  const sideCls = side === 'right' ? 'left-full ml-2 origin-left' : 'right-full mr-2 origin-right';
  return (
    <span className="group relative inline-flex items-center">
      <span
        tabIndex={0}
        aria-describedby={id}
        className="ml-2 inline-flex h-5 w-5 select-none items-center justify-center rounded-full border border-white/30 text-xs text-white/80 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/70"
      >
        i
      </span>
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${sideCls} z-20 w-64 rounded-md border border-white/15 bg-black/80 p-2 text-sm text-white opacity-0 shadow-lg backdrop-blur-md transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100`}
      >
        {text}
      </span>
    </span>
  );
};

/** Consistent label + tooltip wrapper; allows per-field tooltip side. */
const FieldRow: React.FC<{
  label: string;
  tip: string;
  tipSide?: 'left' | 'right';
  children: React.ReactNode;
}> = ({ label, tip, tipSide = 'left', children }) => (
  <label className="flex items-center justify-between gap-3">
    <span className="inline-flex items-center">
      <span>{label}</span>
      <InfoTip text={tip} side={tipSide} />
    </span>
    {children}
  </label>
);

const baseInputCls = 'rounded bg-gray-800 p-2';
const numInputCls = `${baseInputCls} w-14`;
const checkboxCls = 'h-5 w-5';

/** Small primitives */
const NumField: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { value: number; min?: number }
> = (props) => <input type="number" className={numInputCls} {...props} />;

const CheckboxField: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { checked: boolean }
> = (props) => <input type="checkbox" className={checkboxCls} {...props} />;

const SelectField: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & { value: number | string }
> = (props) => <select className={baseInputCls} {...props} />;

/** Max caps per game field */
const GAME_MAX: Partial<Record<keyof Ruleset['game'], number>> = {
  targetScore: 21,
  winBy: 6,
  servesPerTurn: 6,
  deuceServesPerTurn: 6,
};

/** Field configs (tiny & declarative) */
const GAME_NUMBER_FIELDS: Array<{
  key: keyof Ruleset['game'];
  label: string;
  tip: string;
  min?: number;
}> = [
  {
    key: 'targetScore',
    label: 'Target Score',
    tip: 'Points needed to win a game (with the required margin). Officially games are to 11 points.',
    min: 1,
  },
  {
    key: 'winBy',
    label: 'Win By',
    tip: 'Minimum lead required to win a game. Official rule: win by 2 (e.g., 12–10 when target is 11).',
    min: 1,
  },
  {
    key: 'servesPerTurn',
    label: 'Serves per Turn',
    tip: 'How many consecutive serves each player gets before service switches. Officially it’s 2 serves each until deuce.',
    min: 1,
  },
  {
    key: 'deuceServesPerTurn',
    label: 'Deuce Serves per Turn',
    tip: 'After deuce, service alternates every point. Officially: 1 serve each at deuce.',
    min: 1,
  },
];

export const MatchRules: React.FC<MatchRulesProps> = ({ rules, onUpdate, onReset }) => {
  const [open, setOpen] = useState(false);

  const updateGame = useCallback(
    <K extends keyof Ruleset['game']>(key: K, value: Ruleset['game'][K]) => {
      onUpdate((prev) => ({ ...prev, game: { ...prev.game, [key]: value } }));
    },
    [onUpdate],
  );

  const updateMatch = useCallback(
    <K extends keyof Ruleset['match']>(key: K, value: Ruleset['match'][K]) => {
      onUpdate((prev) => ({ ...prev, match: { ...prev.match, [key]: value } }));
    },
    [onUpdate],
  );

  return (
    <div className="rounded-md border border-white/10 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between"
      >
        <span className="text-xl font-semibold text-yellow-400">Match Rules</span>
        <span className="text-xl leading-none text-yellow-400">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-white">
            {/* Match: Best Of (left column → tooltip on the right) */}
            <FieldRow
              label="Best Of"
              tip="Number of games in the match. “Best of 5” means first to 3 games wins the match (3→2, 5→3, 7→4)."
              tipSide="right"
            >
              <SelectField
                value={rules.match.bestOf}
                onChange={(e) =>
                  updateMatch('bestOf', getBestOf(e.target.value, rules.match.bestOf))
                }
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={7}>7</option>
              </SelectField>
            </FieldRow>

            {/* Game: numeric fields from config (compute column by index parity) */}
            {GAME_NUMBER_FIELDS.map(({ key, label, tip, min = 1 }, i) => {
              const hardMax = GAME_MAX[key];
              const value = rules.game[key] as number;

              // Special handling for targetScore so we can auto-clamp mid-swap when it changes
              if (key === 'targetScore') {
                return (
                  <FieldRow
                    key={String(key)}
                    label={label}
                    tip={tip}
                    tipSide={i % 2 === 1 ? 'right' : 'left'}
                  >
                    <NumField
                      min={min}
                      max={hardMax}
                      value={value}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        const max = hardMax ?? Number.POSITIVE_INFINITY;
                        const nextTarget = clamp(raw, min, max);

                        onUpdate((prev) => {
                          const next = {
                            ...prev,
                            game: { ...prev.game, targetScore: nextTarget },
                          };

                          // Dynamic cap for mid-swap = targetScore - 1 (at least 1 so min<=max)
                          const dynMax = Math.max(1, nextTarget - 1);
                          const currentMid = next.match.decidingGameMidSwapAtPoints;
                          if (typeof currentMid === 'number' && currentMid > dynMax) {
                            next.match = {
                              ...next.match,
                              decidingGameMidSwapAtPoints: dynMax,
                            };
                          }
                          return next;
                        });
                      }}
                    />
                  </FieldRow>
                );
              }

              return (
                <FieldRow
                  key={String(key)}
                  label={label}
                  tip={tip}
                  tipSide={i % 2 === 1 ? 'right' : 'left'} // index 1 & 3 are left column → show on right
                >
                  <NumField
                    min={min}
                    max={hardMax}
                    value={value}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      const max = hardMax ?? Number.POSITIVE_INFINITY;
                      updateGame(key as any, clamp(raw, min, max) as any);
                    }}
                  />
                </FieldRow>
              );
            })}

            {/* Match: Deciding Game Mid-Swap At (right column → default left tooltip)
                Dynamic max = targetScore - 1 (at least 1 to keep min <= max) */}
            <FieldRow
              label="Deciding Game Mid-Swap At"
              tip="In the final game of a match, players change ends when the first player reaches this many points."
            >
              {(() => {
                const min = 1;
                const dynMax = Math.max(1, (rules.game.targetScore as number) - 1);
                const value = (rules.match.decidingGameMidSwapAtPoints ??
                  Math.min(5, dynMax)) as number;

                return (
                  <NumField
                    min={min}
                    max={dynMax}
                    value={clamp(value, min, dynMax)}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      const next = clamp(raw, min, dynMax);
                      updateMatch('decidingGameMidSwapAtPoints', next as any);
                    }}
                  />
                );
              })()}
            </FieldRow>

            {/* Match: Switch Ends (left column → tooltip on the right) */}
            <FieldRow
              label="Switch Ends Each Game"
              tip="Players change ends after every game. This balances lighting, drafts, and visual advantages."
              tipSide="right"
            >
              <CheckboxField
                checked={rules.match.switchEndsEachGame}
                onChange={(e) => updateMatch('switchEndsEachGame', e.target.checked)}
              />
            </FieldRow>

            {/* Match: Alternate Initial Server (right column → default left tooltip) */}
            <FieldRow
              label="Alternate Initial Server"
              tip="Who serves first alternates each game (the player who didn’t start the previous game serves first in the next)."
            >
              <CheckboxField
                checked={rules.match.alternateInitialServerEachGame}
                onChange={(e) => updateMatch('alternateInitialServerEachGame', e.target.checked)}
              />
            </FieldRow>
          </div>

          <div className="flex justify-end">
            <PlayButton size="sm" color="gold" onClick={onReset}>
              RESET RULES
            </PlayButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchRules;
