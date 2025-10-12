import React from 'react';

export type CardTone = 'glass' | 'transparent' | 'solid';

interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  accent?: string; // Tailwind gradient classes, e.g. "from-indigo-500 to-purple-500"
  tone?: CardTone;
  padded?: boolean;
  className?: string;
  style?: React.CSSProperties;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

const toneClass: Record<CardTone, string> = {
  glass: 'bg-slate-950/60',
  transparent: 'bg-transparent',
  solid: 'bg-slate-900',
};

const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  accent,
  tone = 'glass',
  padded = true,
  className,
  style,
  headerRight,
  footer,
  children,
}) => {
  const classes = [
    'relative overflow-hidden rounded-2xl border border-white/10 shadow shadow-indigo-950/20',
    toneClass[tone],
    padded ? 'p-6' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const surfaceBgByTone: Record<CardTone, string> = {
    glass: 'rgba(2, 6, 23, 0.6)', // approx tailwind slate-950/60
    transparent: 'transparent',
    solid: 'rgb(15, 23, 42)', // approx tailwind slate-900
  };

  return (
    <div
      className={classes}
      style={{ ...style, ['--card-surface-bg' as any]: surfaceBgByTone[tone] }}
    >
      {(title || subtitle || headerRight) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h3 className="text-xl font-semibold text-white">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
            )}
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
      )}
      {children}
      {footer && <div className="mt-4 pt-4">{footer}</div>}
    </div>
  );
};

export default Card;
