// apps/frontend/src/pages/pong/local/components/PlayButton/PlayButton.tsx
import React from 'react';

export type PlayButtonSize = 'sm' | 'md' | 'lg';

export interface PlayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  color?: React.CSSProperties['color'];
  size?: PlayButtonSize;
  fullWidth?: boolean;
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
      style,
      disabled,
      ...props
    },
    ref,
  ) => {
    const rootCls = [
      // layout & sizing
      'inline-flex items-center justify-center rounded-md cursor-pointer',
      SIZE_CLS[size],
      fullWidth ? 'w-full' : 'w-auto',

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
