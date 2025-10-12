import React from 'react';

export interface ColorOption {
  name: string;
  hex: string;
}

type Size = 'sm' | 'md' | 'lg';
type Shape = 'circle' | 'square';

export interface ColorPaletteProps {
  palette: ColorOption[];
  selected?: string | null;
  onSelect: (color: ColorOption) => void;
  size?: Size;
  shape?: Shape;
  className?: string;
  ariaLabel?: string;
  showLabels?: boolean;
}

const sizeMap: Record<Size, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

const ColorPalette: React.FC<ColorPaletteProps> = ({
  palette,
  selected,
  onSelect,
  size = 'md',
  shape = 'circle',
  className,
  ariaLabel,
  showLabels = false,
}) => {
  const isSelected = (hex: string) =>
    (selected ?? '').toLowerCase() === hex.toLowerCase();

  const rounded = shape === 'circle' ? 'rounded-full' : 'rounded-md';

  return (
    <div
      className={["flex flex-wrap gap-2", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel || 'Color palette'}
    >
      {palette.map((c) => {
        const active = isSelected(c.hex);
        return (
          <button
            key={c.hex}
            type="button"
            aria-label={c.name}
            title={c.name}
            onClick={() => onSelect(c)}
            className={[
              'relative inline-flex items-center justify-center border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
              sizeMap[size],
              rounded,
              active ? 'scale-110 border-white shadow' : 'border-white/30 hover:border-white/60',
            ].join(' ')}
            style={{ backgroundColor: c.hex }}
          >
            <span className="sr-only">{c.name}</span>
            {active && <span className={`pointer-events-none absolute inset-0 ${rounded} ring-1 ring-white/70`} />}
          </button>
        );
      })}
      {showLabels && (
        <div className="basis-full" aria-hidden />
      )}
      {showLabels && (
        <div className="mt-2 grid w-full grid-cols-7 gap-2 text-center text-xs text-slate-300">
          {palette.map((c) => (
            <span key={c.hex} className="truncate">{c.name}</span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ColorPalette;
