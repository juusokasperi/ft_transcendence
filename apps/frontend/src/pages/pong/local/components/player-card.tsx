import React from 'react';
import type { ControllerScheme } from '../../../../games/pong/modes/preferences';
import type { PlayerSettings } from '../utils/storage';
import Card from './Card';
import ColorPalette, { type ColorOption } from './ColorPalette';
import { DEFAULT_PONG_PALETTE } from './palettes';

type ControllerOption = {
  value: ControllerScheme;
  label: string;
};

type PlayerCardProps = {
  title: string;
  player: PlayerSettings;
  controllerOptions: ReadonlyArray<ControllerOption>;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  onControllerChange: (controller: ControllerScheme) => void;
  palette?: ReadonlyArray<ColorOption>;
};

export const PlayerCard: React.FC<PlayerCardProps> = ({
  title,
  player,
  controllerOptions,
  onNameChange,
  onColorChange,
  onControllerChange,
  palette = DEFAULT_PONG_PALETTE,
}) => {
  return (
    <Card title={title} className="flex flex-col items-center space-y-4 text-center">
      <label className="block w-full text-center text-sm font-semibold md:text-base">
        Choose player name
      </label>
      <input
        type="text"
        value={player.name}
        onChange={(event) => onNameChange(event.target.value)}
        className="w-64 rounded border border-white/20 bg-black/40 px-3 py-2 text-base outline-none placeholder:text-white/40 focus:border-white/40"
        placeholder={title}
      />

      <label className="block w-full text-center text-sm font-semibold md:text-base">
        Choose a paddle color
      </label>
      <ColorPalette
        palette={palette}
        selected={player.paddleColor}
        onSelect={(color) => onColorChange(color.hex)}
      />

      <label className="block w-full pt-2 text-center text-sm font-semibold md:text-base">
        Choose controls
      </label>
      <select
        value={player.controller}
        onChange={(event) => onControllerChange(event.target.value as ControllerScheme)}
        className="w-64 rounded border border-white/20 bg-black/40 px-3 py-2 text-base outline-none focus:border-white/40"
      >
        {controllerOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Card>
  );
};

export default PlayerCard;
