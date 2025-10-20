import React from 'react';
import type { BotDifficulty } from '../../../../games/pong/ai/bot-controller';

type AISettingsProps = {
  enabled: boolean;
  difficulty: BotDifficulty;
  arrowSeatLabel: string;
  onToggle: (enabled: boolean) => void;
  onDifficultyChange: (difficulty: BotDifficulty) => void;
};

export const AISettings: React.FC<AISettingsProps> = ({
  enabled,
  difficulty,
  arrowSeatLabel,
  onToggle,
  onDifficultyChange,
}) => {
  return (
    <div className="rounded-md border border-white/10 p-4 text-white/90">
      <div className="flex flex-col items-center space-y-4 text-center">
        <label className="flex w-full items-center justify-center gap-3 text-base">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onToggle(event.target.checked)}
          />
          <h3 className="text-xl font-semibold">AI Opponent ({arrowSeatLabel})</h3>
        </label>

        <p className="text-sm text-white/60">
          The AI always drives the Arrow Up / Arrow Down controls.
        </p>

        <div className="flex items-center justify-center gap-4">
          <label htmlFor="botDifficulty" className="text-sm font-semibold text-white md:text-base">
            Difficulty
          </label>

          <select
            id="botDifficulty"
            value={difficulty}
            onChange={(event) => onDifficultyChange(event.target.value as BotDifficulty)}
            disabled={!enabled}
            className="w-48 rounded border border-white/20 bg-black/40 px-3 py-2 text-base outline-none transition focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default AISettings;
