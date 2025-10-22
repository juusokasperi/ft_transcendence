import React from 'react';

export type HeaderAlign = 'left' | 'center' | 'between';

type CardProps = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: React.ReactNode;
  align?: HeaderAlign;
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
};

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  actions,
  tone = 'bg-slate-950/60',
  align = 'center',
  footer,
  className,
  children,
}) => {
  const rootCls = [
    'relative rounded-2xl border border-white/10',
    tone,
    'p-4',
    className,
  ].filter(Boolean).join(' ');

  const header = title || subtitle || actions;

  const headerCls =
    align === 'between'
      ? 'mb-3 flex items-start justify-between gap-3'
      : align === 'center'
      ? 'mb-3 flex flex-col items-center gap-1 text-center'
      : 'mb-3 flex flex-col gap-1';

  const titleCls = 'text-xl font-semibold text-white';
  const subtitleCls = 'mt-1 text-sm text-slate-300';

  return (
    <div className={rootCls}>
      {header && (
        <div className={headerCls}>
          <div className={align === 'between' ? '' : 'w-full'}>
            {title && <h3 className={`${titleCls} ${align === 'center' ? 'text-center w-full' : ''}`}>{title}</h3>}
            {subtitle && <p className={`${subtitleCls} ${align === 'center' ? 'text-center' : ''}`}>{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}

      {children}

      {footer && <div className="mt-4 pt-4">{footer}</div>}
    </div>
  );
};

export default Card;
