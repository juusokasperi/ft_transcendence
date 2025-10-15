import React from 'react';

export type CardTone = 'glass' | 'transparent' | 'solid';
export type HeaderAlign = 'left' | 'center' | 'between';

interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  accent?: string;
  tone?: CardTone;
  padded?: boolean;
  className?: string;
  style?: React.CSSProperties;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  headerAlign?: HeaderAlign;
}

const toneClass: Record<CardTone, string> = {
  glass: 'bg-slate-950/60',
  transparent: 'bg-transparent',
  solid: 'bg-slate-900',
};

const surfaceBgByTone: Record<CardTone, string> = {
  glass: 'rgba(2, 6, 23, 0.6)',
  transparent: 'transparent',
  solid: 'rgb(15, 23, 42)',
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
  headerAlign = 'center',
}) => {
  const classes = [
    'relative overflow-hidden rounded-2xl border border-white/10 shadow shadow-indigo-950/20',
    toneClass[tone],
    padded ? 'p-6' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const hasRight = !!headerRight;
  // If 'between' is requested but there's no right node, center looks nicer than left
  const effectiveAlign: HeaderAlign =
    headerAlign === 'between' && !hasRight ? 'center' : headerAlign;

  const headerClass =
    effectiveAlign === 'between'
      ? 'mb-4 flex items-start justify-between gap-4'
      : effectiveAlign === 'center'
        ? 'mb-4 flex flex-col items-center gap-1 text-center'
        : 'mb-4 flex flex-col gap-1';

  const titleClass =
    effectiveAlign === 'center'
      ? 'text-xl font-semibold text-white text-center w-full'
      : 'text-xl font-semibold text-white';

  const subtitleClass =
    effectiveAlign === 'center'
      ? 'mt-1 text-sm text-slate-300 text-center'
      : 'mt-1 text-sm text-slate-300';

  return (
    <div
      className={classes}
      style={{ ...style, ['--card-surface-bg' as any]: surfaceBgByTone[tone] }}
    >
      {(title || subtitle || headerRight) && (
        <div className={headerClass}>
          <div className={effectiveAlign === 'between' ? '' : 'w-full'}>
            {title && <h3 className={titleClass}>{title}</h3>}
            {subtitle && <p className={subtitleClass}>{subtitle}</p>}
          </div>
          {hasRight && <div className="shrink-0">{headerRight}</div>}
        </div>
      )}

      {children}

      {footer && <div className="mt-4 pt-4">{footer}</div>}
    </div>
  );
};

export default Card;
