import React, { type SetStateAction } from 'react';
import type { BotDifficulty } from '../../../../games/pong/ai/bot-controller';
import Card from './Card';
import PlayButton from './PlayButton/PlayButton';
import { AISettings } from './AI-settings';
import { MatchRules } from './match-rules';
import { PlayerCard } from './player-card';
import { CONTROLLER_OPTIONS } from '../utils/constants';
import type { UserSettings } from '../utils/storage';

type SettingsViewProps = {
  settings: UserSettings;
  onUpdateSettings: (updater: SetStateAction<UserSettings>) => void;
  onSave: () => void;
  onReset: () => void;
  onResetRules: () => void;
  onPlay: () => void;
  aiEnabled: boolean;
  botDifficulty: BotDifficulty;
  onToggleAI: (enabled: boolean) => void;
  onDifficultyChange: (difficulty: BotDifficulty) => void;
  arrowSeatLabel: string;
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onSave,
  onReset,
  onResetRules,
  onPlay,
  aiEnabled,
  botDifficulty,
  onToggleAI,
  onDifficultyChange,
  arrowSeatLabel,
}) => {
  return (
    <Card
      title={<div className="w-full text-center">Local Game Settings</div>}
      accent="from-pink-500 via-purple-500 to-indigo-500"
      className="w-full max-w-4xl space-y-6 backdrop-blur"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PlayerCard
          title="Player 1"
          player={settings.player1}
          controllerOptions={CONTROLLER_OPTIONS}
          onNameChange={(name) =>
            onUpdateSettings((prev) => ({
              ...prev,
              player1: { ...prev.player1, name },
            }))
          }
          onColorChange={(paddleColor) =>
            onUpdateSettings((prev) => ({
              ...prev,
              player1: { ...prev.player1, paddleColor },
            }))
          }
          onControllerChange={(controller) =>
            onUpdateSettings((prev) => {
              if (controller === prev.player2.controller) {
                return {
                  ...prev,
                  player1: { ...prev.player1, controller },
                  player2: { ...prev.player2, controller: prev.player1.controller },
                };
              }
              return {
                ...prev,
                player1: { ...prev.player1, controller },
              };
            })
          }
        />

        <PlayerCard
          title="Player 2"
          player={settings.player2}
          controllerOptions={CONTROLLER_OPTIONS}
          onNameChange={(name) =>
            onUpdateSettings((prev) => ({
              ...prev,
              player2: { ...prev.player2, name },
            }))
          }
          onColorChange={(paddleColor) =>
            onUpdateSettings((prev) => ({
              ...prev,
              player2: { ...prev.player2, paddleColor },
            }))
          }
          onControllerChange={(controller) =>
            onUpdateSettings((prev) => {
              if (controller === prev.player1.controller) {
                return {
                  ...prev,
                  player2: { ...prev.player2, controller },
                  player1: { ...prev.player1, controller: prev.player2.controller },
                };
              }
              return {
                ...prev,
                player2: { ...prev.player2, controller },
              };
            })
          }
        />
      </div>

      <AISettings
        enabled={aiEnabled}
        difficulty={botDifficulty}
        arrowSeatLabel={arrowSeatLabel}
        onToggle={onToggleAI}
        onDifficultyChange={onDifficultyChange}
      />

      <MatchRules
        rules={settings.rules}
        onUpdate={(updater) =>
          onUpdateSettings((prev) => ({
            ...prev,
            rules: updater(prev.rules),
          }))
        }
        onReset={onResetRules}
      />

      <div className="flex flex-wrap justify-center gap-4">
        <PlayButton color="limegreen" onClick={onSave}>
          SAVE SETTINGS
        </PlayButton>
        <PlayButton color="crimson" onClick={onReset}>
          RESET SETTINGS
        </PlayButton>
      </div>

      <div className="flex justify-center">
        <PlayButton color="cyan" onClick={onPlay}>
          PLAY
        </PlayButton>
      </div>
    </Card>
  );
};

export default SettingsView;
