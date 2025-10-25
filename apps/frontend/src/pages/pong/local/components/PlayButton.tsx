// apps/frontend/src/pages/pong/local/components/PlayButton.tsx
import React from 'react';
import { Link, type To } from 'react-router-dom';

export type PlayButtonSize = 'sm' | 'md' | 'lg';

export interface PlayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  color?: React.CSSProperties['color'];
  size?: PlayButtonSize;
  fullWidth?: boolean;
  responsiveCompact?: boolean; // apply compact sizing on very small screens
  // When provided, the button renders as a React Router Link for navigation semantics
  to?: To;
  replace?: boolean;
  state?: unknown;
}

const SIZE_CLS: Record<PlayButtonSize, string> = {
  sm: 'h-[3em] min-w-[8.5em] text-[14px] border-[2px]',
  md: 'h-[3.5em] min-w-[10em] text-[16px] border-[3px]',
  lg: 'h-[4em] min-w-[12em] text-[18px] border-[3px]',
};

export const PlayButton = React.forwardRef<HTMLButtonElement, PlayButtonProps>(
  (
    {
      label = 'PLAY',
      children,
      className,
      color,
      size = 'md',
      fullWidth = false,
      responsiveCompact = false,
      style,
      disabled,
      to,
      replace,
      state,
      ...props
    },
    ref,
  ) => {
    const RESPONSIVE_COMPACT_CLS =
      'max-[800px]:!h-[3.5em] max-[800px]:!min-w-[10em] max-[800px]:!text-[16px]';
    const rootCls = [
      // layout & sizing
      'inline-flex items-center justify-center rounded-md cursor-pointer',
      SIZE_CLS[size],
      fullWidth ? 'w-full' : 'w-auto',
      responsiveCompact ? RESPONSIVE_COMPACT_CLS : '',

      // visual system
      'bg-transparent text-current border-current font-bold select-none',

      // interaction & motion
      'transition-[box-shadow,transform] duration-200 ease-out will-change-transform',

      // hover/active/focus
      'hover:[box-shadow:inset_0_0_25px_currentColor]',
      'active:translate-y-[1px]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
      'disabled:opacity-60 disabled:cursor-not-allowed',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // Render as Link when `to` is provided for proper navigation semantics
    if (to !== undefined) {
      const linkCls = [rootCls, disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : '']
        .filter(Boolean)
        .join(' ');
      return (
        <Link
          to={to}
          replace={replace}
          state={state}
          className={linkCls}
          style={{ color, ...(style || {}) }}
          aria-disabled={disabled ? true : undefined}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...(props as any)}
        >
          {children ?? label}
        </Link>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        className={rootCls}
        style={{ color, ...(style || {}) }}
        disabled={disabled}
        {...props}
      >
        {children ?? label}
      </button>
    );
  },
);

PlayButton.displayName = 'PlayButton';
export default PlayButton;
