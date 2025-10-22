import React from 'react';
import clsx from '../utils/clsx';

type Align = 'left' | 'center' | 'between';

export type PageHeaderProps = {
  id?: string; // when provided, ties into layout aria-labelledby
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  align?: Align; // default adjusts: 'between' when actions, else 'left'
  srOnlyTitle?: boolean;
  className?: string;
};

const PageHeader: React.FC<PageHeaderProps> = ({
  id,
  title,
  subtitle,
  actions,
  align,
  srOnlyTitle = false,
  className,
}) => {
  const computedAlign: Align = align ?? (actions ? 'between' : 'left');
  const rootCls = clsx('mb-4 md:mb-6', className);
  const wrapCls =
    computedAlign === 'between'
      ? 'flex items-start justify-between gap-4'
      : computedAlign === 'center'
      ? 'flex flex-col items-center text-center gap-1'
      : 'flex flex-col gap-1';

  const titleCls = srOnlyTitle
    ? 'sr-only'
    : 'text-2xl font-semibold tracking-wide';
  const subtitleCls = 'text-sm text-slate-300';

  return (
    <header className={rootCls}>
      <div className={wrapCls}>
        <div className={computedAlign === 'between' ? 'min-w-0' : 'w-full'}>
          <h1 id={id} className={titleCls}>
            {title}
          </h1>
          {subtitle ? <p className={subtitleCls}>{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
};

export default PageHeader;
