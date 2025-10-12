import React from 'react';
import styles from './PlayButton.module.css';

type CSSVars = React.CSSProperties & {
  ['--btn-w']?: string;
  ['--btn-h']?: string;
  ['--btn-font']?: string;
  ['--btn-border']?: string;
};

export type PlayButtonSize = 'sm' | 'md' | 'lg';

export interface PlayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  color?: React.CSSProperties['color']; // optional, strongly typed
  size?: PlayButtonSize;
  fullWidth?: boolean;
}

const SIZE_VARS: Record<PlayButtonSize, Partial<CSSVars>> = {
  sm: { ['--btn-w']: '8.5em', ['--btn-h']: '3em', ['--btn-font']: '14px', ['--btn-border']: '2px' },
  md: {}, // default CSS
  lg: { ['--btn-w']: '12em', ['--btn-h']: '4em', ['--btn-font']: '18px', ['--btn-border']: '3px' },
};

export const PlayButton = React.forwardRef<HTMLButtonElement, PlayButtonProps>(
  (
    { label = 'PLAY', children, className, color, size = 'md', fullWidth = false, style, ...props },
    ref,
  ) => {
    const varStyle: CSSVars = {
      ...style,
      color,
      ...(SIZE_VARS[size] ?? {}),
      ...(fullWidth ? { ['--btn-w']: '100%' } : null),
    };

    return (
      <button
        ref={ref}
        type="button"
        className={[styles.button, className].filter(Boolean).join(' ')}
        style={varStyle}
        {...props}
      >
        {children ?? label}
      </button>
    );
  },
);

PlayButton.displayName = 'PlayButton';
export default PlayButton;
